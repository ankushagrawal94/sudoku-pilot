import assert from "node:assert/strict";
import { canonicalPuzzleId } from "../scripts/catalog/canonical.mjs";
import { certifyPuzzle, solveWithTechniques } from "../src/difficulty.js";
import { generatePuzzle } from "../src/generator.js";
import { CATALOG_BY_DIFFICULTY, selectCatalogPuzzle, transformCatalogPuzzle } from "../src/puzzleCatalog.js";
import { TECHNIQUE_LEVELS } from "../src/puzzles.js";

const base = "050002004730009085402000960290000800001026500800904021020001437083007000040260198";
const equivalent = [
  relabel(base, { 1: 9, 2: 8, 3: 7, 4: 6, 5: 5, 6: 4, 7: 3, 8: 2, 9: 1 }),
  transform(base, [1, 0, 2, 3, 4, 5, 6, 7, 8], [0, 1, 2, 3, 4, 5, 6, 7, 8]),
  transform(base, [3, 4, 5, 0, 1, 2, 6, 7, 8], [0, 1, 2, 3, 4, 5, 6, 7, 8]),
  transform(base, [0, 1, 2, 3, 4, 5, 6, 7, 8], [1, 0, 2, 3, 4, 5, 6, 7, 8]),
  transform(base, [0, 1, 2, 3, 4, 5, 6, 7, 8], [3, 4, 5, 0, 1, 2, 6, 7, 8]),
  transpose(base),
  transpose(transform(base, [8, 7, 6, 5, 4, 3, 2, 1, 0], [8, 7, 6, 5, 4, 3, 2, 1, 0]))
];
const id = canonicalPuzzleId(base).canonicalId;
for (const grid of equivalent) assert.equal(canonicalPuzzleId(grid).canonicalId, id, "every supported logical equivalence must share one canonical ID");
const changed = `${base.slice(0, 1)}0${base.slice(2)}`;
assert.notEqual(canonicalPuzzleId(changed).canonicalId, id, "a meaningfully different clue set must not collapse to the same canonical ID");

const allIds = Object.values(CATALOG_BY_DIFFICULTY).flat().map((puzzle) => puzzle.id);
assert.equal(new Set(allIds).size, allIds.length, "catalog IDs must be unique across shards");
for (const [level, shard] of Object.entries(CATALOG_BY_DIFFICULTY)) assert.ok(shard.every((puzzle) => puzzle.level === level), `${level} shard must only contain ${level} puzzles`);
for (const puzzle of Object.values(CATALOG_BY_DIFFICULTY).flat()) {
  assert.match(puzzle.provenance, /^(?:npm:sudoku-gen@1\.0\.2|local:sudoku-pilot-(?:augmentation|extreme|hard-gate-search)@1)$/, `${puzzle.id} must use approved catalog metadata`);
  if (["expert", "extreme"].includes(puzzle.level)) {
    assert.ok(puzzle.gates >= 5, `${puzzle.id} must ship with at least five hard gates`);
    assert.equal(puzzle.gateTechniques.length, puzzle.gates, `${puzzle.id} must retain one technique label per gate`);
  }
}

const historyPool = CATALOG_BY_DIFFICULTY.easy.slice(0, 2);
const unseen = selectCatalogPuzzle({ difficulty: "easy", playedCanonicalIds: [historyPool[0].id], random: () => 0 });
if (CATALOG_BY_DIFFICULTY.easy.length > 1) assert.notEqual(unseen.id, historyPool[0].id, "selection must prefer an unseen canonical seed");
const transformed = transformCatalogPuzzle(historyPool[0], () => 0.25);
assert.equal(transformed.id, historyPool[0].id, "visual transformation must preserve the canonical seed ID");
assert.notEqual(transformed.grid, historyPool[0].grid, "visual transformation should be applied after seed selection");

const iterable = { *[Symbol.iterator]() { yield "Hidden Single"; } };
assert.doesNotThrow(() => generatePuzzle({ difficulty: "medium", requiredTechniques: iterable }));
assert.throws(() => generatePuzzle({ requiredTechniques: "Hidden Single" }), /array, Set, or other iterable/);
assert.throws(() => generatePuzzle({ difficulty: "medium", requiredTechniques: ["Hidden Single"], excludedTechniques: new Set(["Hidden Single"]) }), /both required and excluded/);

const requiredFixture = Object.values(CATALOG_BY_DIFFICULTY).flat().find((puzzle) => puzzle.required.length);
if (requiredFixture) {
  const technique = requiredFixture.required[0];
  const profile = TECHNIQUE_LEVELS[requiredFixture.level];
  assert.equal(solveWithTechniques(requiredFixture.grid, profile.filter((item) => item !== technique)).solved, false, "required means disabling the technique prevents completion");
  assert.equal(certifyPuzzle(requiredFixture.grid, { requiredTechniques: new Set([technique]) }).certified, true);
}

console.log("catalog tests passed");

function relabel(grid, mapping) { return [...grid].map((cell) => cell === "0" ? cell : mapping[cell]).join(""); }
function transform(grid, rows, columns) { return rows.flatMap((row) => columns.map((column) => grid[row * 9 + column])).join(""); }
function transpose(grid) { return Array.from({ length: 81 }, (_, index) => grid[(index % 9) * 9 + Math.floor(index / 9)]).join(""); }
