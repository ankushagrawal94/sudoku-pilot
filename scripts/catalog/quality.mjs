import { certifyPuzzle, evaluateHardGates, findGenuinelyRequiredTechniques, ratePuzzle } from "../../src/difficulty.js";

export const HARD_GATE_METRIC_VERSION = "deterministic-certified-path-v1";
export const PRODUCTION_GATE_THRESHOLDS = Object.freeze({ expert: 5, extreme: 5 });

export function evaluateCatalogCandidate(grid, suppliedSolution, requestedLevel, {
  gateThresholds = PRODUCTION_GATE_THRESHOLDS
} = {}) {
  const clueCount = [...grid].filter((cell) => cell !== "0").length;
  const threshold = gateThresholds[requestedLevel] || 0;
  const hardGates = threshold ? evaluateHardGates(grid, { level: requestedLevel }) : null;
  const preliminary = hardGates?.status === "solved" && hardGates.gateCount
    ? {
        status: "solved",
        level: requestedLevel,
        solutionCount: null,
        steps: hardGates.steps,
        hardestTechnique: hardGates.gateTechniques.at(-1) || null,
        techniqueCounts: hardGates.techniqueCounts,
        trace: hardGates.trace,
        solution: hardGates.solution
      }
    : ratePuzzle(grid, { checkUniqueness: false });

  const rejected = (reason, rating = preliminary, extra = {}) => ({
    status: "rejected", reason, rating, clueCount, hardGates,
    evaluationMetadata: { uniquenessChecked: false, gateThreshold: threshold, ...extra }
  });

  if (threshold && hardGates.status !== "solved") {
    const reason = hardGates.status === "ceiling-exceeded"
      ? "difficulty-mismatch:extreme"
      : preliminary.status === "solved" && preliminary.level !== requestedLevel
        ? `difficulty-mismatch:${preliminary.level}`
        : preliminary.status;
    return rejected(reason);
  }
  if (preliminary.status !== "solved") return rejected(preliminary.status);
  if (preliminary.level !== requestedLevel) return rejected(`difficulty-mismatch:${preliminary.level}`);
  if (threshold && hardGates.gateCount < threshold) {
    return rejected(`insufficient-${requestedLevel}-gates`);
  }
  if (clueCount < 17 || clueCount > 45) return rejected("clue-count-out-of-range");
  if (preliminary.steps < 1 || preliminary.steps > 200) return rejected("step-count-out-of-range");
  if (!hasReasonableDistribution(grid)) return rejected("empty-row-column-or-box");

  const certification = certifyPuzzle(grid);
  const rating = certification.rating;
  if (!certification.certified) {
    return {
      status: "rejected", reason: certification.reason, rating, clueCount, hardGates,
      evaluationMetadata: { uniquenessChecked: true, gateThreshold: threshold }
    };
  }
  if (rating.level !== requestedLevel) {
    return {
      status: "rejected", reason: `difficulty-mismatch:${rating.level}`, rating, clueCount, hardGates,
      evaluationMetadata: { uniquenessChecked: true, gateThreshold: threshold }
    };
  }
  if (rating.solutionCount !== 1) {
    return {
      status: "rejected", reason: "not-unique", rating, clueCount, hardGates,
      evaluationMetadata: { uniquenessChecked: true, gateThreshold: threshold }
    };
  }

  const solution = rating.solution.join("");
  if (suppliedSolution && suppliedSolution.replace(/[^1-9]/g, "") !== solution) {
    return {
      status: "rejected", reason: "solution-mismatch", rating, clueCount, hardGates,
      evaluationMetadata: { uniquenessChecked: true, gateThreshold: threshold }
    };
  }

  const repeatRating = ratePuzzle(grid);
  const repeatGates = threshold ? evaluateHardGates(grid, { level: requestedLevel }) : null;
  const stableRating = (value) => JSON.stringify([
    value.status, value.level, value.solutionCount, value.steps,
    value.hardestTechnique, value.techniqueCounts, value.solution
  ]);
  const stableGates = (value) => value && JSON.stringify([
    value.status, value.gateCount, value.gateTechniques,
    value.gateTracePositions, value.steps, value.techniqueCounts, value.solution
  ]);
  if (stableRating(rating) !== stableRating(repeatRating) || stableGates(hardGates) !== stableGates(repeatGates)) {
    return {
      status: "rejected", reason: "unstable-rating", rating, clueCount, hardGates,
      evaluationMetadata: { uniquenessChecked: true, gateThreshold: threshold }
    };
  }

  return {
    status: "eligible",
    reason: null,
    rating,
    clueCount,
    solution,
    hardGates,
    requiredTechniques: findGenuinelyRequiredTechniques(grid),
    evaluationMetadata: {
      uniquenessChecked: true,
      deterministicRepeatChecked: true,
      gateThreshold: threshold,
      metricVersion: HARD_GATE_METRIC_VERSION
    }
  };
}

export function ensureQualityColumns(database) {
  const columns = new Set(database.prepare("PRAGMA table_info(candidates)").all().map((row) => row.name));
  const additions = {
    gate_count: "INTEGER",
    gate_techniques: "TEXT",
    gate_positions: "TEXT",
    gate_effort: "TEXT",
    evaluation_metadata: "TEXT",
    lineage_root_id: "INTEGER"
  };
  for (const [name, type] of Object.entries(additions)) {
    if (!columns.has(name)) database.exec(`ALTER TABLE candidates ADD COLUMN ${name} ${type}`);
  }
}

export function ensureLineageRoots(database) {
  const rows = database.prepare("SELECT id,parent_id,lineage_root_id FROM candidates ORDER BY id").all();
  const byId = new Map(rows.map((row) => [row.id, row]));
  const cache = new Map();
  const resolve = (id, visiting = new Set()) => {
    if (cache.has(id)) return cache.get(id);
    const row = byId.get(id);
    if (!row || visiting.has(id)) return id;
    if (row.lineage_root_id) {
      cache.set(id, row.lineage_root_id);
      return row.lineage_root_id;
    }
    const parentId = row.parent_id?.startsWith("candidate:") ? Number(row.parent_id.slice(10)) : null;
    const root = parentId && byId.has(parentId) ? resolve(parentId, new Set([...visiting, id])) : id;
    cache.set(id, root);
    return root;
  };
  const update = database.prepare("UPDATE candidates SET lineage_root_id=? WHERE id=? AND lineage_root_id IS NULL");
  database.exec("BEGIN");
  try {
    for (const row of rows) update.run(resolve(row.id), row.id);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function persistCandidateEvaluation(database, candidateId, evaluation, suppliedSolution = null) {
  const gates = evaluation.hardGates;
  database.prepare(`UPDATE candidates SET status=?, rejection_reason=?, rated_level=?, clue_count=?, step_count=?,
    technique_metadata=?, required_techniques=?, solution=?, full_trace=?, gate_count=?, gate_techniques=?,
    gate_positions=?, gate_effort=?, evaluation_metadata=? WHERE id=?`).run(
    evaluation.status,
    evaluation.reason,
    evaluation.rating?.level || null,
    evaluation.clueCount,
    evaluation.rating?.steps || gates?.steps || null,
    JSON.stringify(evaluation.rating?.techniqueCounts || gates?.techniqueCounts || {}),
    JSON.stringify(evaluation.requiredTechniques || []),
    evaluation.solution || suppliedSolution || null,
    JSON.stringify(evaluation.rating?.trace || gates?.trace || []),
    gates?.gateCount ?? null,
    JSON.stringify(gates?.gateTechniques || []),
    JSON.stringify(gates?.gateTracePositions || []),
    JSON.stringify(gates ? {
      metric: gates.metric,
      status: gates.status,
      lowerTierSteps: gates.lowerTierSteps,
      tierSteps: gates.tierSteps,
      totalSteps: gates.steps,
      gates: gates.gates
    } : {}),
    JSON.stringify(evaluation.evaluationMetadata || {}),
    candidateId
  );
}

export function recoverPendingCandidateEvaluations(database, {
  levels = ["expert", "extreme"],
  gateThresholds = PRODUCTION_GATE_THRESHOLDS
} = {}) {
  const pending = database.prepare(`SELECT id,grid,solution,requested_level FROM candidates
    WHERE status='pending' ORDER BY id`).all()
    .filter((row) => levels.includes(row.requested_level));
  for (const row of pending) {
    const evaluation = evaluateCatalogCandidate(row.grid, row.solution, row.requested_level, { gateThresholds });
    persistCandidateEvaluation(database, row.id, evaluation, row.solution);
  }
  return pending.length;
}

export function hasReasonableDistribution(grid) {
  const cells = [...grid];
  for (let line = 0; line < 9; line += 1) {
    if (!cells.slice(line * 9, line * 9 + 9).some((cell) => cell !== "0")) return false;
    if (!Array.from({ length: 9 }, (_, row) => cells[row * 9 + line]).some((cell) => cell !== "0")) return false;
    const boxRow = Math.floor(line / 3) * 3;
    const boxCol = (line % 3) * 3;
    if (!Array.from({ length: 9 }, (_, offset) => cells[(boxRow + Math.floor(offset / 3)) * 9 + boxCol + offset % 3]).some((cell) => cell !== "0")) return false;
  }
  return true;
}
