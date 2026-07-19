import {
  applyMove,
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
    trace.push({
      technique: move.technique,
      title: move.title,
      fills: move.fills.map((fill) => ({ ...fill })),
      eliminations: move.eliminations.map((elimination) => ({ ...elimination }))
    });
    techniqueCounts[move.technique] = (techniqueCounts[move.technique] || 0) + 1;
    applyMove(puzzle, move);
  }

  const hardestTechnique = trace.reduce((hardest, move) => (
    ALL_TECHNIQUES.indexOf(move.technique) > ALL_TECHNIQUES.indexOf(hardest) ? move.technique : hardest
  ), null);

  return { solved: isSolved(puzzle.values), steps: trace, trace, techniqueCounts, hardestTechnique, solution: [...puzzle.values] };
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
