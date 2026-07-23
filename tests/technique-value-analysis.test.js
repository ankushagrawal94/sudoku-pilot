import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import analysis from "../output/technique-value-analysis-v0.1.json" with { type: "json" };
import { CERTIFIED_PUZZLES } from "../src/puzzleCatalog.js";
import { COACHING_TIER_2 } from "../src/puzzles.js";

const currentFingerprint = createHash("sha256")
  .update(CERTIFIED_PUZZLES.map(({ id, grid, solution, level }) => `${id}|${grid}|${solution}|${level}`).join("\n"))
  .digest("hex");

assert.equal(analysis.catalogFingerprint, currentFingerprint, "tracked analysis must match the current catalog");
assert.equal(analysis.population.puzzles, 500);
assert.deepEqual(Object.values(analysis.population.puzzlesByLevel), [100, 100, 100, 100, 100]);
assert.equal(analysis.techniqueMetrics.length, COACHING_TIER_2.length);
assert.equal(Object.keys(analysis.portfolioCoverage).length, 2 ** COACHING_TIER_2.length);
assert.equal(analysis.dataQuality.readyForAnalysis, true);

const baselineSolved = analysis.headlineProfiles.tier1.solved;
const committedSolved = analysis.headlineProfiles.allCommitted.solved;
const shapleyTotal = analysis.techniqueMetrics.reduce((sum, row) => sum + row.shapleyMarginalPuzzles, 0);
assert.ok(Math.abs(shapleyTotal - (committedSolved - baselineSolved)) < 0.01, "Shapley contributions must reconcile to incremental coverage");

const greedyFinal = analysis.greedyLearningOrder.at(-1);
assert.equal(greedyFinal.cumulativeSolved, committedSolved);
assert.deepEqual(
  new Set(analysis.greedyLearningOrder.map(({ technique }) => technique)),
  new Set(COACHING_TIER_2)
);

console.log("Technique value analysis artifact checks passed.");
