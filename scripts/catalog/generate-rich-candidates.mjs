import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { ensureLocalArchiveIdentity, resolveWarehouseConnectionString, syncLocalArchive } from "./warehouse.mjs";
import {
  ensureQualityColumns,
  ensureLineageRoots,
  evaluateCatalogCandidate,
  persistCandidateEvaluation,
  recoverPendingCandidateEvaluations,
  PRODUCTION_GATE_THRESHOLDS
} from "./quality.mjs";
import { frontierScore, mutationFor, RICH_PRODUCER, seededRandom } from "./rich-generator.mjs";

const options = parseOptions(process.argv.slice(2));
if (!existsSync(options.state)) throw new Error(`Local catalog archive does not exist: ${options.state}`);
const database = new DatabaseSync(options.state);
database.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;");
ensureQualityColumns(database);
ensureLineageRoots(database);
ensureLocalArchiveIdentity(database);
database.exec("CREATE TABLE IF NOT EXISTS build_state (key TEXT PRIMARY KEY, value INTEGER NOT NULL)");
const recoveredPending = recoverPendingCandidateEvaluations(database, {
  levels: options.levels,
  gateThresholds: options.gateThresholds
});
if (recoveredPending) console.log(JSON.stringify({ recoveredPending }));
database.prepare(`INSERT INTO provenance(id,producer,version,source_url,configuration) VALUES (?,?,?,?,?)
  ON CONFLICT(id) DO UPDATE SET producer=excluded.producer,version=excluded.version,configuration=excluded.configuration`).run(
  RICH_PRODUCER.id,
  RICH_PRODUCER.producer,
  RICH_PRODUCER.version,
  null,
  JSON.stringify({
    offline: true,
    derivation: "Removes, adds, and swaps solution-consistent clues while optimizing deterministic tier-level hard gates",
    finalAuthority: "Sudoku Pilot logical solver and uniqueness checker"
  })
);

let totalAttempts = 0;
try {
  for (const level of options.levels) {
    const threshold = options.gateThresholds[level];
    const stateKey = `rich-search-cursor:${level}`;
    database.prepare("INSERT OR IGNORE INTO build_state(key,value) VALUES (?,0)").run(stateKey);
    let cursor = database.prepare("SELECT value FROM build_state WHERE key=?").get(stateKey).value;
    let inventory = qualifyingInventory(level, threshold);
    let eligible = inventory.effective;
    const attemptCounts = lineageAttemptCounts(level);
    let targetLineage = null;
    while (eligible < options.poolTarget && totalAttempts < options.attemptLimit && cursor < options.maxAttempts) {
      targetLineage ||= chooseTargetLineage(level, inventory, attemptCounts);
      const frontier = loadFrontier(level, threshold, targetLineage);
      if (!frontier.length) throw new Error(`${level} has no evaluated parent candidates. Run catalog:quality:reevaluate first.`);
      const chooser = seededRandom(`${options.seed}:parent:${level}:${cursor + 1}`);
      const parentPool = frontier.slice(0, Math.min(options.beamWidth, frontier.length));
      const eligibleParents = frontier.filter((candidate) => isQualifyingStatus(candidate.status)).slice(0, options.beamWidth);
      const nearMisses = frontier.filter((candidate) => !isQualifyingStatus(candidate.status) && candidate.gateCount >= threshold).slice(0, options.beamWidth);
      const roll = chooser();
      const chosenPool = eligibleParents.length && roll < 0.65
        ? eligibleParents
        : nearMisses.length && roll < 0.9
          ? nearMisses
          : parentPool;
      const parent = chosenPool[Math.floor(chooser() ** 2 * chosenPool.length)];
      let proposal = null;
      for (let retry = 0; retry < 200; retry += 1) {
        proposal = mutationFor(parent, { level, cursor: cursor + 1, targetGates: threshold, seed: options.seed, retry });
        if (!proposal) continue;
        if (!database.prepare("SELECT 1 FROM candidates WHERE grid=?").get(proposal.grid)) break;
        proposal = null;
      }
      if (!proposal) throw new Error(`${level} could not produce a unique mutation at cursor ${cursor + 1}`);
      proposal.configuration.lineageRootId = parent.lineageRootId;

      const inserted = database.prepare(`INSERT INTO candidates
        (grid,solution,requested_level,producer,producer_version,configuration,provenance_id,parent_id,status,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,datetime('now'))`).run(
        proposal.grid,
        parent.solution,
        level,
        RICH_PRODUCER.producer,
        RICH_PRODUCER.version,
        JSON.stringify(proposal.configuration),
        RICH_PRODUCER.id,
        `candidate:${parent.id}`,
        "pending"
      );
      const candidateId = Number(inserted.lastInsertRowid);
      database.prepare("UPDATE candidates SET lineage_root_id=? WHERE id=?").run(parent.lineageRootId, candidateId);
      const evaluation = evaluateCatalogCandidate(proposal.grid, parent.solution, level, { gateThresholds: options.gateThresholds });
      database.exec("BEGIN");
      try {
        persistCandidateEvaluation(database, candidateId, evaluation, parent.solution);
        cursor += 1;
        database.prepare("UPDATE build_state SET value=? WHERE key=?").run(cursor, stateKey);
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
      totalAttempts += 1;
      attemptCounts.set(parent.lineageRootId, (attemptCounts.get(parent.lineageRootId) || 0) + 1);
      if (evaluation.status === "eligible") {
        inventory = qualifyingInventory(level, threshold);
        eligible = inventory.effective;
      }
      const lineageEligible = inventory.byLineage.get(parent.lineageRootId) || 0;
      if (lineageEligible >= options.maxPerLineage
        || (!lineageEligible && (attemptCounts.get(parent.lineageRootId) || 0) >= options.maxEmptyLineageAttempts)) {
        targetLineage = null;
      }
      if (totalAttempts % options.reportEvery === 0 || evaluation.status === "eligible") {
        console.log(JSON.stringify({
          level,
          cursor,
          runAttempts: totalAttempts,
          eligible,
          rawEligible: inventory.raw,
          eligibleLineages: inventory.byLineage.size,
          target: options.poolTarget,
          result: evaluation.status,
          reason: evaluation.reason,
          gates: evaluation.hardGates?.gateCount,
          gateStatus: evaluation.hardGates?.status,
          clues: evaluation.clueCount,
          parent: parent.id,
          lineage: parent.lineageRootId
        }));
      }
      if (totalAttempts % options.checkpointEvery === 0) await checkpoint(`rich-search:${level}`);
    }
    await checkpoint(`rich-search:${level}`);
    inventory = qualifyingInventory(level, threshold);
    console.log(JSON.stringify({ level, cursor, eligible: inventory.effective, rawEligible: inventory.raw, eligibleLineages: inventory.byLineage.size, target: options.poolTarget }));
    if (totalAttempts >= options.attemptLimit) break;
  }
} finally {
  database.close();
}

function isQualifyingStatus(status) {
  return ["eligible", "selected", "accepted", "coverage-not-selected"].includes(status);
}

function loadFrontier(level, targetGates, lineageRootId) {
  return database.prepare(`SELECT id,grid,solution,requested_level,rated_level,clue_count,step_count,gate_count,lineage_root_id,
      gate_effort,status,rejection_reason FROM candidates
    WHERE requested_level=? AND lineage_root_id=? AND gate_count IS NOT NULL AND length(solution)=81 AND clue_count BETWEEN 19 AND 34
    ORDER BY gate_count DESC,id DESC LIMIT 5000`).all(level, lineageRootId).map((row) => {
      const effort = JSON.parse(row.gate_effort || "{}");
      const candidate = {
        id: row.id,
        grid: row.grid,
        solution: row.solution,
        requestedLevel: row.requested_level,
        ratedLevel: row.rated_level,
        clueCount: row.clue_count,
        stepCount: row.step_count,
        gateCount: row.gate_count || 0,
        lineageRootId: row.lineage_root_id,
        gateStatus: effort.status,
        status: row.status,
        rejectionReason: row.rejection_reason
      };
      return { ...candidate, frontierScore: frontierScore(candidate, targetGates) };
    }).sort((a, b) => b.frontierScore - a.frontierScore || b.id - a.id);
}

function chooseTargetLineage(level, inventory, attemptCounts) {
  const partial = [...inventory.byLineage.entries()]
    .filter(([, count]) => count > 0 && count < options.maxPerLineage)
    .sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  if (partial.length) return partial[0][0];
  const ranked = database.prepare(`SELECT lineage_root_id,MAX(gate_count) best_gate,MAX(step_count) best_steps
    FROM candidates WHERE requested_level=? AND gate_count IS NOT NULL AND length(solution)=81
    GROUP BY lineage_root_id ORDER BY best_gate DESC,best_steps DESC,lineage_root_id`).all(level);
  const candidate = ranked.find((row) =>
    (inventory.byLineage.get(row.lineage_root_id) || 0) < options.maxPerLineage
    && (attemptCounts.get(row.lineage_root_id) || 0) < options.maxEmptyLineageAttempts
  );
  if (!candidate) throw new Error(`${level} exhausted every lineage under the configured search budgets.`);
  return candidate.lineage_root_id;
}

function qualifyingInventory(level, threshold) {
  const rows = database.prepare(`SELECT lineage_root_id,COUNT(*) count FROM candidates WHERE requested_level=?
    AND status IN ('eligible','selected','accepted','coverage-not-selected') AND gate_count>=?
    GROUP BY lineage_root_id`).all(level, threshold);
  const byLineage = new Map(rows.map((row) => [row.lineage_root_id, row.count]));
  return {
    byLineage,
    raw: rows.reduce((sum, row) => sum + row.count, 0),
    effective: rows.reduce((sum, row) => sum + Math.min(row.count, options.maxPerLineage), 0)
  };
}

function lineageAttemptCounts(level) {
  return new Map(database.prepare(`SELECT lineage_root_id,COUNT(*) count FROM candidates
    WHERE requested_level=? AND producer=? GROUP BY lineage_root_id`).all(level, RICH_PRODUCER.producer)
    .map((row) => [row.lineage_root_id, row.count]));
}

async function checkpoint(sourceLabel) {
  if (!options.warehouseUrl) return;
  const counts = await syncLocalArchive(database, { connectionString: options.warehouseUrl, sourceLabel });
  console.log(JSON.stringify({ checkpoint: sourceLabel, counts }));
}

function parseOptions(args) {
  const value = (name, fallback) => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : fallback;
  };
  const levels = value("--levels", "expert,extreme").split(",").map((item) => item.trim()).filter(Boolean);
  if (levels.some((level) => !["expert", "extreme"].includes(level))) throw new Error("--levels only accepts expert and extreme");
  return {
    state: value("--state", ".catalog-build/catalog.sqlite"),
    levels,
    poolTarget: Number(value("--pool", 150)),
    attemptLimit: Number(value("--attempts", Infinity)),
    maxAttempts: Number(value("--max-attempts", 250000)),
    beamWidth: Number(value("--beam-width", 250)),
    maxPerLineage: Number(value("--max-per-lineage", 10)),
    maxEmptyLineageAttempts: Number(value("--max-empty-lineage-attempts", 2000)),
    checkpointEvery: Number(value("--checkpoint-every", 250)),
    reportEvery: Number(value("--report-every", 25)),
    seed: value("--seed", "sudoku-pilot-rich-v1"),
    warehouseUrl: value("--warehouse-url", resolveWarehouseConnectionString()),
    gateThresholds: {
      expert: Number(value("--min-expert-gates", PRODUCTION_GATE_THRESHOLDS.expert)),
      extreme: Number(value("--min-extreme-gates", PRODUCTION_GATE_THRESHOLDS.extreme))
    }
  };
}
