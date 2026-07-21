import {
  applyMove,
  clonePuzzle,
  createPuzzle,
  fillAllNotes,
  findAllMoves,
  isSolved,
  parseGrid
} from "./solver.js";
import { ALL_TECHNIQUES, TECHNIQUE_LEVELS } from "./puzzles.js";

export const DIFFICULTY_ORDER = ["easy", "medium", "hard", "expert", "extreme"];

const SINGLES = ["Last Digit", "Naked Single", "Hidden Single"];
const LOCKED_CANDIDATES = [...SINGLES, "Pointing Candidates", "Claiming Candidates"];

export const HARD_GATE_LEVELS = ["expert", "extreme"];

export const DIFFICULTY_DEFINITIONS = {
  easy: {
    techniques: SINGLES,
    description: "Solved with singles in at most 45 logical steps."
  },
  medium: {
    techniques: SINGLES,
    description: "Solved with singles, but requires more than 45 logical steps."
  },
  hard: {
    techniques: LOCKED_CANDIDATES,
    description: "Requires pointing or claiming candidates."
  },
  expert: {
    techniques: TECHNIQUE_LEVELS.expert,
    description: "Requires a naked or hidden pair, triple, or quadruple subset."
  },
  extreme: {
    techniques: TECHNIQUE_LEVELS.extreme,
    description: "Requires a supported fish, wing, colouring, Crane, or Empty Rectangle technique."
  }
};

export function ratePuzzle(grid, { checkUniqueness = true, stepLimit = 500 } = {}) {
  const values = parseGrid(grid);
  if (!isValidGrid(values)) return { status: "invalid", level: null, solutionCount: 0 };

  const solutionCount = checkUniqueness ? countSolutions(values, 2) : null;
  if (checkUniqueness && solutionCount !== 1) {
    return { status: solutionCount ? "multiple-solutions" : "unsolvable", level: null, solutionCount };
  }

  const singles = solveTrace(grid, SINGLES, stepLimit);
  if (singles.solved) {
    const level = singles.steps.length <= 45 ? "easy" : "medium";
    return buildRating(level, singles, solutionCount);
  }

  const hard = solveTrace(grid, LOCKED_CANDIDATES, stepLimit);
  if (hard.solved) return buildRating("hard", hard, solutionCount);

  const expert = solveTrace(grid, TECHNIQUE_LEVELS.expert, stepLimit);
  if (expert.solved) return buildRating("expert", expert, solutionCount);

  const extreme = solveTrace(grid, TECHNIQUE_LEVELS.extreme, stepLimit);
  if (extreme.solved) return buildRating("extreme", extreme, solutionCount);

  return {
    status: "unsupported",
    level: null,
    solutionCount,
    solverStatus: "stuck",
    steps: extreme.steps.length,
    hardestTechnique: extreme.hardestTechnique,
    techniqueCounts: extreme.techniqueCounts,
    trace: extreme.trace
  };
}

export function solveWithTechniques(grid, techniques, { stepLimit = 500 } = {}) {
  const allowed = normalizeTechniqueCollection(techniques, "techniques");
  return solveTrace(grid, allowed, stepLimit);
}

// This certifies one deterministic solving path. It does not claim that the
// returned count is the mathematical minimum across every possible move order.
export function evaluateHardGates(grid, { level, stepLimit = 500 } = {}) {
  if (!HARD_GATE_LEVELS.includes(level)) {
    throw new Error(`Hard gates are only defined for: ${HARD_GATE_LEVELS.join(", ")}.`);
  }
  const values = parseGrid(grid);
  if (!isValidGrid(values)) return buildGateResult({ level, status: "invalid" });

  const lowerLevel = level === "expert" ? "hard" : "expert";
  const ceiling = TECHNIQUE_LEVELS[level];
  const lowerTechniques = TECHNIQUE_LEVELS[lowerLevel];
  const tierTechniques = ceiling.filter((technique) => !lowerTechniques.includes(technique));
  const aboveCeiling = level === "expert"
    ? TECHNIQUE_LEVELS.extreme.filter((technique) => !ceiling.includes(technique))
    : [];
  const puzzle = createPuzzle(grid);
  fillAllNotes(puzzle);
  const trace = [];
  const gates = [];
  const techniqueCounts = {};
  let lowerStepsSinceGate = 0;
  let lowerTierSteps = 0;

  while (trace.length < stepLimit && !isSolved(puzzle.values)) {
    const lowerMove = findAllMoves(puzzle, lowerTechniques)[0];
    if (lowerMove) {
      trace.push(snapshotMove(lowerMove));
      techniqueCounts[lowerMove.technique] = (techniqueCounts[lowerMove.technique] || 0) + 1;
      lowerStepsSinceGate += 1;
      lowerTierSteps += 1;
      applyMove(puzzle, lowerMove);
      continue;
    }

    const gateMove = findAllMoves(puzzle, tierTechniques)[0];
    if (!gateMove) {
      const status = aboveCeiling.length && findAllMoves(puzzle, aboveCeiling).length
        ? "ceiling-exceeded"
        : "unsupported";
      return buildGateResult({
        level, status, gates, trace, techniqueCounts, lowerTierSteps,
        solution: puzzle.values, tierTechniques
      });
    }

    gates.push({
      gate: gates.length + 1,
      technique: gateMove.technique,
      traceIndex: trace.length,
      tracePosition: trace.length + 1,
      lowerStepsBeforeGate: lowerStepsSinceGate,
      unsolvedCellsBeforeGate: puzzle.values.filter((value) => !value).length
    });
    trace.push(snapshotMove(gateMove));
    techniqueCounts[gateMove.technique] = (techniqueCounts[gateMove.technique] || 0) + 1;
    applyMove(puzzle, gateMove);
    lowerStepsSinceGate = 0;
  }

  return buildGateResult({
    level,
    status: isSolved(puzzle.values) ? "solved" : "step-limit",
    gates,
    trace,
    techniqueCounts,
    lowerTierSteps,
    solution: puzzle.values,
    tierTechniques
  });
}

// This bounded search asks a stronger question than evaluateHardGates: what is
// the fewest gates across every supported move order that obeys the same
// lower-tier-exhaustion rule? It only reports an exact minimum after proving it;
// otherwise the deterministic path remains an observed upper bound.
export function analyzeMinimumHardGates(grid, { level, nodeLimit = 50_000 } = {}) {
  if (!HARD_GATE_LEVELS.includes(level)) {
    throw new Error(`Hard gates are only defined for: ${HARD_GATE_LEVELS.join(", ")}.`);
  }
  if (!Number.isInteger(nodeLimit) || nodeLimit < 1) throw new Error("nodeLimit must be a positive integer.");
  const deterministic = evaluateHardGates(grid, { level });
  const values = parseGrid(grid);
  if (!isValidGrid(values)) {
    return { status: "invalid", level, nodeLimit, nodesVisited: 0, exactMinimum: null, deterministicGateCount: 0 };
  }

  const lowerLevel = level === "expert" ? "hard" : "expert";
  const ceiling = TECHNIQUE_LEVELS[level];
  const lowerTechniques = TECHNIQUE_LEVELS[lowerLevel];
  const tierTechniques = ceiling.filter((technique) => !lowerTechniques.includes(technique));
  const puzzle = createPuzzle(grid);
  fillAllNotes(puzzle);
  const memo = new Map();
  let nodesVisited = 0;
  let exhausted = false;

  const search = (state) => {
    if (nodesVisited >= nodeLimit) {
      exhausted = true;
      return { complete: false, minimum: Infinity };
    }
    nodesVisited += 1;
    if (isSolved(state.values)) return { complete: true, minimum: 0 };
    const key = hardGateStateKey(state);
    if (memo.has(key)) return { complete: true, minimum: memo.get(key) };

    const lowerMoves = findAllMoves(state, lowerTechniques);
    const moves = lowerMoves.length ? lowerMoves : findAllMoves(state, tierTechniques);
    const gateCost = lowerMoves.length ? 0 : 1;
    if (!moves.length) {
      memo.set(key, Infinity);
      return { complete: true, minimum: Infinity };
    }

    let minimum = Infinity;
    let complete = true;
    const childStates = new Set();
    for (const move of moves) {
      const child = clonePuzzle(state);
      applyMove(child, move);
      const childKey = hardGateStateKey(child);
      if (childStates.has(childKey)) continue;
      childStates.add(childKey);
      const result = search(child);
      complete &&= result.complete;
      minimum = Math.min(minimum, gateCost + result.minimum);
      // Zero is the absolute minimum after a lower move; one is the absolute
      // minimum at a state where a tier-level move is already required.
      if (minimum === gateCost) {
        complete = true;
        break;
      }
      if (exhausted) break;
    }
    if (complete) memo.set(key, minimum);
    return { complete, minimum };
  };

  const result = search(puzzle);
  const exactMinimum = result.complete && Number.isFinite(result.minimum) ? result.minimum : null;
  return {
    status: exactMinimum == null ? "inconclusive" : "proven",
    level,
    nodeLimit,
    nodesVisited,
    exactMinimum,
    deterministicGateCount: deterministic.gateCount,
    deterministicStatus: deterministic.status
  };
}

export function certifyPuzzle(grid, {
  requiredTechniques = [],
  excludedTechniques = [],
  checkUniqueness = true,
  stepLimit = 500
} = {}) {
  const required = normalizeTechniqueCollection(requiredTechniques, "requiredTechniques");
  const excluded = normalizeTechniqueCollection(excludedTechniques, "excludedTechniques");
  for (const technique of required) {
    if (excluded.includes(technique)) throw new Error(`${technique} cannot be both required and excluded.`);
  }

  const rating = ratePuzzle(grid, { checkUniqueness, stepLimit });
  if (rating.status !== "solved") {
    return { certified: false, rating, requiredTechniques: [], excludedTechniques: excluded, reason: rating.status };
  }

  const profile = TECHNIQUE_LEVELS[rating.level];
  for (const technique of required) {
    if (!profile.includes(technique)) throw new Error(`${technique} is not available at ${rating.level} difficulty.`);
  }

  const withoutExcluded = profile.filter((technique) => !excluded.includes(technique));
  const excludedPath = solveTrace(grid, withoutExcluded, stepLimit);
  if (!excludedPath.solved) {
    return {
      certified: false,
      rating,
      requiredTechniques: [],
      excludedTechniques: excluded,
      reason: "excluded-techniques-required"
    };
  }

  const genuinelyRequired = [];
  for (const technique of required) {
    const withoutTechnique = profile.filter((candidate) => candidate !== technique && !excluded.includes(candidate));
    if (solveTrace(grid, withoutTechnique, stepLimit).solved) {
      return {
        certified: false,
        rating,
        requiredTechniques: genuinelyRequired,
        excludedTechniques: excluded,
        reason: `technique-not-required:${technique}`
      };
    }
    genuinelyRequired.push(technique);
  }

  return {
    certified: true,
    rating: excluded.length ? buildRating(rating.level, excludedPath, rating.solutionCount) : rating,
    requiredTechniques: genuinelyRequired,
    excludedTechniques: excluded,
    reason: null
  };
}

export function findGenuinelyRequiredTechniques(grid, { level, excludedTechniques = [], stepLimit = 500 } = {}) {
  const excluded = normalizeTechniqueCollection(excludedTechniques, "excludedTechniques");
  const rating = ratePuzzle(grid, { stepLimit });
  const resolvedLevel = level || rating.level;
  if (rating.status !== "solved" || !resolvedLevel) return [];
  const profile = TECHNIQUE_LEVELS[resolvedLevel].filter((technique) => !excluded.includes(technique));
  const used = new Set(Object.keys(rating.techniqueCounts));
  return profile.filter((technique) => used.has(technique) && !solveTrace(grid, profile.filter((candidate) => candidate !== technique), stepLimit).solved);
}

export function countSolutions(gridOrValues, limit = 2) {
  const values = Array.isArray(gridOrValues) ? [...gridOrValues] : parseGrid(gridOrValues);
  if (!isValidGrid(values)) return 0;
  return search(values, Math.max(1, limit));
}

function solveTrace(grid, techniques, stepLimit) {
  const puzzle = createPuzzle(grid);
  fillAllNotes(puzzle);
  const trace = [];
  const techniqueCounts = {};

  for (let index = 0; index < stepLimit && !isSolved(puzzle.values); index += 1) {
    const move = findAllMoves(puzzle, techniques)[0];
    if (!move) break;
    trace.push(snapshotMove(move));
    techniqueCounts[move.technique] = (techniqueCounts[move.technique] || 0) + 1;
    applyMove(puzzle, move);
  }

  const hardestTechnique = trace.reduce((hardest, move) => (
    ALL_TECHNIQUES.indexOf(move.technique) > ALL_TECHNIQUES.indexOf(hardest) ? move.technique : hardest
  ), null);

  return { solved: isSolved(puzzle.values), steps: trace, trace, techniqueCounts, hardestTechnique, solution: [...puzzle.values] };
}

function snapshotMove(move) {
  return {
    technique: move.technique,
    title: move.title,
    fills: move.fills.map((fill) => ({ ...fill })),
    eliminations: move.eliminations.map((elimination) => ({ ...elimination }))
  };
}

function hardGateStateKey(puzzle) {
  return `${puzzle.values.join("")}|${puzzle.eliminated
    .map((digits) => [...digits].sort((a, b) => a - b).join(""))
    .join(",")}`;
}

function buildGateResult({
  level,
  status,
  gates = [],
  trace = [],
  techniqueCounts = {},
  lowerTierSteps = 0,
  solution = [],
  tierTechniques = []
}) {
  return {
    metric: "deterministic-certified-path-v1",
    level,
    status,
    solved: status === "solved",
    gateCount: gates.length,
    gateTechniques: gates.map((gate) => gate.technique),
    gateTracePositions: gates.map((gate) => gate.tracePosition),
    gates,
    steps: trace.length,
    lowerTierSteps,
    tierSteps: gates.length,
    techniqueCounts,
    tierTechniques,
    trace,
    solution: [...solution]
  };
}

function normalizeTechniqueCollection(value, field) {
  if (value == null) return [];
  if (typeof value === "string" || typeof value[Symbol.iterator] !== "function") {
    throw new TypeError(`${field} must be an array, Set, or other iterable collection.`);
  }
  const techniques = [...new Set(value)];
  for (const technique of techniques) {
    if (!ALL_TECHNIQUES.includes(technique)) throw new Error(`Unknown technique in ${field}: ${technique}`);
  }
  return techniques;
}

function buildRating(level, result, solutionCount) {
  return {
    status: "solved",
    level,
    solutionCount,
    steps: result.steps.length,
    hardestTechnique: result.hardestTechnique,
    techniqueCounts: result.techniqueCounts,
    trace: result.trace,
    solution: result.solution
  };
}

function isValidGrid(values) {
  if (values.length !== 81) return false;
  for (let index = 0; index < 81; index += 1) {
    const value = values[index];
    if (!value) continue;
    values[index] = 0;
    const row = Math.floor(index / 9);
    const col = index % 9;
    const boxRow = Math.floor(row / 3) * 3;
    const boxCol = Math.floor(col / 3) * 3;
    const conflict = values.some((peer, peerIndex) => peer === value && (
      Math.floor(peerIndex / 9) === row ||
      peerIndex % 9 === col ||
      (Math.floor(Math.floor(peerIndex / 9) / 3) * 3 === boxRow && Math.floor((peerIndex % 9) / 3) * 3 === boxCol)
    ));
    values[index] = value;
    if (conflict) return false;
  }
  return true;
}

function search(values, remaining) {
  let bestIndex = -1;
  let bestCandidates = null;
  for (let index = 0; index < 81; index += 1) {
    if (values[index]) continue;
    const candidates = candidatesFor(values, index);
    if (!candidates.length) return 0;
    if (!bestCandidates || candidates.length < bestCandidates.length) {
      bestIndex = index;
      bestCandidates = candidates;
      if (candidates.length === 1) break;
    }
  }
  if (bestIndex === -1) return 1;

  let total = 0;
  for (const digit of bestCandidates) {
    values[bestIndex] = digit;
    total += search(values, remaining - total);
    values[bestIndex] = 0;
    if (total >= remaining) return total;
  }
  return total;
}

function candidatesFor(values, index) {
  const row = Math.floor(index / 9);
  const col = index % 9;
  const boxRow = Math.floor(row / 3) * 3;
  const boxCol = Math.floor(col / 3) * 3;
  const used = new Set();
  for (let offset = 0; offset < 9; offset += 1) {
    used.add(values[row * 9 + offset]);
    used.add(values[offset * 9 + col]);
    used.add(values[(boxRow + Math.floor(offset / 3)) * 9 + boxCol + (offset % 3)]);
  }
  return [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((digit) => !used.has(digit));
}
