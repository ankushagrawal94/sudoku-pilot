import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import process from "node:process";
import {
  applyMove,
  createPuzzle,
  fillAllNotes,
  findAllMoves,
  isSolved
} from "../src/solver.js";
import { solveWithTechniques } from "../src/difficulty.js";
import { CERTIFIED_PUZZLES } from "../src/puzzleCatalog.js";
import {
  ALL_TECHNIQUES,
  COACHING_TIER_1,
  COACHING_TIER_2,
  COMMITTED_COACHING_TECHNIQUES,
  TECHNIQUE_LEVELS
} from "../src/puzzles.js";

const LEVELS = ["easy", "medium", "hard", "expert", "extreme"];
const STEP_LIMIT = 500;
const FULL_TIER_2_MASK = (1 << COACHING_TIER_2.length) - 1;
const DEFAULT_OUTPUT = "output/technique-value-analysis-v0.1.json";

const outputPath = readOption("--output") || DEFAULT_OUTPUT;
const policyNames = ["standard", "advanced-first", "max-impact"];
const profileCache = new Map();

const catalogFingerprint = createHash("sha256")
  .update(CERTIFIED_PUZZLES.map(({ id, grid, solution, level }) => `${id}|${grid}|${solution}|${level}`).join("\n"))
  .digest("hex");

console.error(`Analyzing ${CERTIFIED_PUZZLES.length} shipped puzzles across ${1 << COACHING_TIER_2.length} Tier 2 portfolios.`);

const subsetProfiles = {};
for (let mask = 0; mask <= FULL_TIER_2_MASK; mask += 1) {
  subsetProfiles[mask] = analyzeProfile(
    profileForMask(mask),
    "standard",
    `tier2-mask:${mask}`,
    mask === 0 ? null : subsetProfiles[0]
  );
  if (mask === 0 || (mask + 1) % 16 === 0) console.error(`Completed ${mask + 1}/${FULL_TIER_2_MASK + 1} Tier 2 portfolios.`);
}

const baseline = subsetProfiles[0];
const committed = subsetProfiles[FULL_TIER_2_MASK];
const allSupported = analyzeProfile(ALL_TECHNIQUES, "standard", "all-supported", baseline);
const allSupportedLeaveOneOut = Object.fromEntries(COACHING_TIER_2.map((technique) => [
  technique,
  analyzeProfile(
    ALL_TECHNIQUES.filter((candidate) => candidate !== technique),
    "standard",
    `all-supported-minus:${technique}`,
    baseline
  )
]));

const soloUnlockSets = new Map(COACHING_TIER_2.map((technique, index) => {
  const solo = subsetProfiles[1 << index];
  return [technique, difference(solo.solvedIds, baseline.solvedIds)];
}));

const techniqueMetrics = COACHING_TIER_2.map((technique, index) => {
  const bit = 1 << index;
  const solo = subsetProfiles[bit];
  const committedWithout = subsetProfiles[FULL_TIER_2_MASK ^ bit];
  const allWithout = allSupportedLeaveOneOut[technique];
  const otherSoloUnlocks = new Set(COACHING_TIER_2
    .filter((candidate) => candidate !== technique)
    .flatMap((candidate) => [...soloUnlockSets.get(candidate)]));
  const storedUsage = CERTIFIED_PUZZLES.filter((puzzle) => puzzle.techniques.includes(technique));
  const storedRequired = CERTIFIED_PUZZLES.filter((puzzle) => puzzle.required.includes(technique));
  const committedTraceUsage = [...committed.results.values()].filter((result) => result.solved && result.techniqueCounts[technique]);

  return {
    technique,
    tier1PlusTechniqueSolved: solo.totalSolved,
    soloIncrementalUnlocks: difference(solo.solvedIds, baseline.solvedIds).size,
    soloIncrementalExtremeUnlocks: difference(solo.solvedIdsByLevel.extreme, baseline.solvedIdsByLevel.extreme).size,
    uniqueSoloUnlocks: [...soloUnlockSets.get(technique)].filter((id) => !otherSoloUnlocks.has(id)).length,
    committedLeaveOneOutLoss: difference(committed.solvedIds, committedWithout.solvedIds).size,
    committedLeaveOneOutLossByLevel: lossesByLevel(committed, committedWithout),
    allSupportedLeaveOneOutLoss: difference(allSupported.solvedIds, allWithout.solvedIds).size,
    allSupportedLeaveOneOutLossByLevel: lossesByLevel(allSupported, allWithout),
    shapleyMarginalPuzzles: round(shapleyValue(index, subsetProfiles), 3),
    storedTracePuzzleCount: storedUsage.length,
    storedRequiredPuzzleCount: storedRequired.length,
    committedTracePuzzleCount: committedTraceUsage.length,
    committedTraceMoveCount: committedTraceUsage.reduce((sum, result) => sum + result.techniqueCounts[technique], 0)
  };
});

const pairwiseSoloOverlap = [];
const pairwiseSynergy = [];
for (let left = 0; left < COACHING_TIER_2.length; left += 1) {
  for (let right = left + 1; right < COACHING_TIER_2.length; right += 1) {
    const leftTechnique = COACHING_TIER_2[left];
    const rightTechnique = COACHING_TIER_2[right];
    const leftSet = soloUnlockSets.get(leftTechnique);
    const rightSet = soloUnlockSets.get(rightTechnique);
    const pair = subsetProfiles[(1 << left) | (1 << right)];
    pairwiseSoloOverlap.push({
      left: leftTechnique,
      right: rightTechnique,
      leftUnlocks: leftSet.size,
      rightUnlocks: rightSet.size,
      sharedUnlocks: intersection(leftSet, rightSet).size,
      unionUnlocks: union(leftSet, rightSet).size,
      jaccard: round(jaccard(leftSet, rightSet), 3)
    });
    pairwiseSynergy.push({
      left: leftTechnique,
      right: rightTechnique,
      pairSolved: pair.totalSolved,
      gainOverBetterSolo: pair.totalSolved - Math.max(subsetProfiles[1 << left].totalSolved, subsetProfiles[1 << right].totalSolved),
      interactionBeyondAdditive: pair.totalSolved - subsetProfiles[1 << left].totalSolved - subsetProfiles[1 << right].totalSolved + baseline.totalSolved
    });
  }
}

console.error("Running move-selection sensitivity checks.");
const sensitivityMasks = [...new Set([
  0,
  FULL_TIER_2_MASK,
  ...COACHING_TIER_2.flatMap((_, index) => [1 << index, FULL_TIER_2_MASK ^ (1 << index)])
])];
const sensitivity = Object.fromEntries(policyNames.map((policy) => {
  const profiles = {};
  for (const mask of sensitivityMasks) {
    profiles[mask] = policy === "standard"
      ? subsetProfiles[mask]
      : analyzeProfile(
        profileForMask(mask),
        policy,
        `${policy}:tier2-mask:${mask}`,
        mask === 0 ? null : profiles[0]
      );
  }
  return [policy, {
    baselineSolved: profiles[0].totalSolved,
    committedSolved: profiles[FULL_TIER_2_MASK].totalSolved,
    ranking: COACHING_TIER_2.map((technique, index) => ({
      technique,
      soloIncrementalUnlocks: difference(profiles[1 << index].solvedIds, profiles[0].solvedIds).size,
      leaveOneOutLoss: difference(profiles[FULL_TIER_2_MASK].solvedIds, profiles[FULL_TIER_2_MASK ^ (1 << index)].solvedIds).size
    })).sort(metricSort("soloIncrementalUnlocks"))
  }];
}));

console.error("Reconciling catalog metadata against fresh solver runs.");
const dataQuality = analyzeDataQuality();

const output = {
  analysisVersion: 1,
  catalogFingerprint,
  population: {
    puzzles: CERTIFIED_PUZZLES.length,
    puzzlesByLevel: Object.fromEntries(LEVELS.map((level) => [level, CERTIFIED_PUZZLES.filter((puzzle) => puzzle.level === level).length])),
    tier1Techniques: COACHING_TIER_1,
    tier2Techniques: COACHING_TIER_2,
    committedTechniques: COMMITTED_COACHING_TECHNIQUES,
    allSupportedTechniques: ALL_TECHNIQUES,
    provisionalFallbackTechniques: ALL_TECHNIQUES.filter((technique) => !COMMITTED_COACHING_TECHNIQUES.includes(technique)),
    stepLimit: STEP_LIMIT
  },
  definitions: {
    solved: "The app solver completed a valid grid within 500 moves using only the named profile.",
    soloIncrementalUnlocks: "Puzzles solved by Tier 1 plus this technique that Tier 1 alone did not solve.",
    committedLeaveOneOutLoss: "Puzzles solved by all 17 committed coaching techniques but not when this Tier 2 technique is disabled.",
    allSupportedLeaveOneOutLoss: "Puzzles solved by all 22 supported techniques but not when this Tier 2 technique is disabled; provisional detectors may act as fallbacks.",
    shapleyMarginalPuzzles: "Average marginal puzzle coverage contributed by the technique across every ordering of the seven Tier 2 techniques.",
    deterministicCaveat: "These metrics follow deterministic or explicitly named move-selection policies. They do not prove necessity across every mathematically possible move order."
  },
  headlineProfiles: {
    tier1: summarizeProfile(baseline),
    allCommitted: summarizeProfile(committed),
    allSupported: summarizeProfile(allSupported)
  },
  techniqueMetrics: techniqueMetrics.sort(metricSort("shapleyMarginalPuzzles")),
  greedyLearningOrder: greedyOrder(subsetProfiles),
  pairwiseSoloOverlap: pairwiseSoloOverlap.sort((a, b) => b.sharedUnlocks - a.sharedUnlocks || b.jaccard - a.jaccard),
  pairwiseSynergy: pairwiseSynergy.sort((a, b) => b.gainOverBetterSolo - a.gainOverBetterSolo || b.interactionBeyondAdditive - a.interactionBeyondAdditive),
  sensitivity,
  portfolioCoverage: Object.fromEntries(Object.entries(subsetProfiles).map(([mask, profile]) => [mask, {
    techniques: techniquesForMask(Number(mask)),
    solved: profile.totalSolved,
    solvedByLevel: profile.solvedByLevel
  }])),
  dataQuality
};

await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.error(`Wrote ${outputPath}.`);

function analyzeProfile(techniques, policy, cacheKey, solvedSeed = null) {
  const key = `${policy}|${cacheKey}`;
  if (profileCache.has(key)) return profileCache.get(key);
  const results = new Map();
  const solvedIds = new Set();
  const solvedIdsByLevel = Object.fromEntries(LEVELS.map((level) => [level, new Set()]));
  for (const puzzle of CERTIFIED_PUZZLES) {
    const seededResult = solvedSeed?.results.get(puzzle.id);
    const result = seededResult?.solved
      ? seededResult
      : policy === "standard"
        ? solveWithTechniques(puzzle.grid, techniques, { stepLimit: STEP_LIMIT })
        : solveWithPolicy(puzzle.grid, techniques, policy);
    results.set(puzzle.id, result);
    if (result.solved) {
      solvedIds.add(puzzle.id);
      solvedIdsByLevel[puzzle.level].add(puzzle.id);
    }
  }
  const profile = {
    techniques: [...techniques],
    totalSolved: solvedIds.size,
    solvedByLevel: Object.fromEntries(LEVELS.map((level) => [level, solvedIdsByLevel[level].size])),
    solvedIds,
    solvedIdsByLevel,
    results
  };
  profileCache.set(key, profile);
  return profile;
}

function solveWithPolicy(grid, techniques, policy) {
  const puzzle = createPuzzle(grid);
  fillAllNotes(puzzle);
  const techniqueCounts = {};
  let steps = 0;
  while (steps < STEP_LIMIT && !isSolved(puzzle.values)) {
    const moves = findAllMoves(puzzle, techniques);
    if (!moves.length) break;
    const move = selectMove(moves, policy);
    techniqueCounts[move.technique] = (techniqueCounts[move.technique] || 0) + 1;
    applyMove(puzzle, move);
    steps += 1;
  }
  return { solved: isSolved(puzzle.values), steps, techniqueCounts, solution: [...puzzle.values] };
}

function selectMove(moves, policy) {
  if (policy === "advanced-first") return moves.at(-1);
  if (policy === "max-impact") {
    return moves.map((move, index) => ({ move, index, impact: move.fills.length * 10 + move.eliminations.length }))
      .sort((a, b) => b.impact - a.impact || a.index - b.index)[0].move;
  }
  throw new Error(`Unknown move-selection policy: ${policy}`);
}

function analyzeDataQuality() {
  const mismatches = [];
  const ids = new Set();
  const grids = new Set();
  let duplicateIds = 0;
  let duplicateGrids = 0;
  let malformedGrids = 0;
  let malformedSolutions = 0;
  let levelProfileFailures = 0;
  let stepMismatches = 0;
  let techniqueSetMismatches = 0;
  let solutionMismatches = 0;
  let requiredTechniqueMismatches = 0;
  const solutionTemplateConcentrationByLevel = Object.fromEntries(LEVELS.map((level) => {
    const counts = new Map();
    for (const puzzle of CERTIFIED_PUZZLES.filter((candidate) => candidate.level === level)) {
      counts.set(puzzle.solution, (counts.get(puzzle.solution) || 0) + 1);
    }
    const largestTemplateCount = Math.max(...counts.values());
    return [level, {
      exactSolutionTemplates: counts.size,
      largestTemplateCount,
      largestTemplateShare: largestTemplateCount / CERTIFIED_PUZZLES.filter((candidate) => candidate.level === level).length
    }];
  }));

  for (const puzzle of CERTIFIED_PUZZLES) {
    if (ids.has(puzzle.id)) duplicateIds += 1;
    if (grids.has(puzzle.grid)) duplicateGrids += 1;
    ids.add(puzzle.id);
    grids.add(puzzle.grid);
    if (!/^[0-9]{81}$/.test(puzzle.grid)) malformedGrids += 1;
    if (!/^[1-9]{81}$/.test(puzzle.solution)) malformedSolutions += 1;

    const profile = TECHNIQUE_LEVELS[puzzle.level];
    const fresh = solveWithTechniques(puzzle.grid, profile, { stepLimit: STEP_LIMIT });
    if (!fresh.solved) levelProfileFailures += 1;
    if (fresh.steps.length !== puzzle.steps) stepMismatches += 1;
    if (!sameValues(Object.keys(fresh.techniqueCounts), puzzle.techniques)) techniqueSetMismatches += 1;
    if (fresh.solution.join("") !== puzzle.solution) solutionMismatches += 1;

    const freshRequired = Object.keys(fresh.techniqueCounts).filter((technique) => (
      !solveWithTechniques(puzzle.grid, profile.filter((candidate) => candidate !== technique), { stepLimit: STEP_LIMIT }).solved
    ));
    if (!sameValues(freshRequired, puzzle.required)) {
      requiredTechniqueMismatches += 1;
      if (mismatches.length < 10) mismatches.push({
        id: puzzle.id,
        level: puzzle.level,
        storedRequired: puzzle.required,
        freshRequired
      });
    }
  }

  return {
    expectedGrain: "one row per shipped canonical puzzle",
    rowCount: CERTIFIED_PUZZLES.length,
    uniqueIds: ids.size,
    uniqueGrids: grids.size,
    duplicateIds,
    duplicateGrids,
    malformedGrids,
    malformedSolutions,
    levelProfileFailures,
    stepMismatches,
    techniqueSetMismatches,
    solutionMismatches,
    requiredTechniqueMismatches,
    solutionTemplateConcentrationByLevel,
    mismatchSamples: mismatches,
    readyForAnalysis: [
      duplicateIds,
      duplicateGrids,
      malformedGrids,
      malformedSolutions,
      levelProfileFailures,
      stepMismatches,
      techniqueSetMismatches,
      solutionMismatches,
      requiredTechniqueMismatches
    ].every((count) => count === 0)
  };
}

function shapleyValue(techniqueIndex, profiles) {
  const n = COACHING_TIER_2.length;
  const bit = 1 << techniqueIndex;
  let value = 0;
  for (let mask = 0; mask <= FULL_TIER_2_MASK; mask += 1) {
    if (mask & bit) continue;
    const size = popcount(mask);
    const weight = factorial(size) * factorial(n - size - 1) / factorial(n);
    value += weight * (profiles[mask | bit].totalSolved - profiles[mask].totalSolved);
  }
  return value;
}

function greedyOrder(profiles) {
  let mask = 0;
  const order = [];
  while (mask !== FULL_TIER_2_MASK) {
    const candidates = COACHING_TIER_2
      .map((technique, index) => ({
        technique,
        index,
        nextMask: mask | (1 << index),
        gain: profiles[mask | (1 << index)].totalSolved - profiles[mask].totalSolved,
        extremeGain: profiles[mask | (1 << index)].solvedByLevel.extreme - profiles[mask].solvedByLevel.extreme
      }))
      .filter(({ nextMask }) => nextMask !== mask)
      .sort((a, b) => b.gain - a.gain || b.extremeGain - a.extremeGain || a.index - b.index);
    const best = candidates[0];
    mask = best.nextMask;
    order.push({
      position: order.length + 1,
      technique: best.technique,
      incrementalPuzzles: best.gain,
      incrementalExtremePuzzles: best.extremeGain,
      cumulativeSolved: profiles[mask].totalSolved,
      cumulativeSolvedByLevel: profiles[mask].solvedByLevel
    });
  }
  return order;
}

function summarizeProfile(profile) {
  return { solved: profile.totalSolved, solvedByLevel: profile.solvedByLevel };
}

function profileForMask(mask) {
  return [...COACHING_TIER_1, ...techniquesForMask(mask)];
}

function techniquesForMask(mask) {
  return COACHING_TIER_2.filter((_, index) => mask & (1 << index));
}

function lossesByLevel(full, reduced) {
  return Object.fromEntries(LEVELS.map((level) => [level, difference(full.solvedIdsByLevel[level], reduced.solvedIdsByLevel[level]).size]));
}

function metricSort(metric) {
  return (a, b) => b[metric] - a[metric] || a.technique.localeCompare(b.technique);
}

function difference(left, right) {
  return new Set([...left].filter((value) => !right.has(value)));
}

function intersection(left, right) {
  return new Set([...left].filter((value) => right.has(value)));
}

function union(left, right) {
  return new Set([...left, ...right]);
}

function jaccard(left, right) {
  const combined = union(left, right);
  return combined.size ? intersection(left, right).size / combined.size : 0;
}

function sameValues(left, right) {
  return [...left].sort().join("|") === [...right].sort().join("|");
}

function popcount(value) {
  let count = 0;
  for (let current = value; current; current >>= 1) count += current & 1;
  return count;
}

function factorial(value) {
  let result = 1;
  for (let current = 2; current <= value; current += 1) result *= current;
  return result;
}

function round(value, digits) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function readOption(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}
