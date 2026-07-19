import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { availableParallelism } from "node:os";
import { Worker } from "node:worker_threads";
import { certifyPuzzle, DIFFICULTY_ORDER, findGenuinelyRequiredTechniques, ratePuzzle } from "../../src/difficulty.js";

const root = new URL("../../", import.meta.url);
const entries = [];
for (const level of DIFFICULTY_ORDER) {
  const shard = JSON.parse(await readFile(new URL(`src/catalog/${level}.json`, root), "utf8"));
  assert.equal(shard.length, 100, `${level} shard must contain exactly 100 puzzles`);
  for (const puzzle of shard) entries.push({ ...puzzle, expectedLevel: level });
}
assert.equal(entries.length, 500, "production catalog must contain exactly 500 puzzles");

const canonical = await canonicalize(entries);
const ids = new Set();
for (let index = 0; index < entries.length; index += 1) {
  const puzzle = entries[index];
  const identity = canonical[index];
  assert.equal(identity.canonicalId, puzzle.id, `${puzzle.id} must match its exact canonical grid identity`);
  assert.ok(!ids.has(puzzle.id), `${puzzle.id} must not be a canonical duplicate`);
  ids.add(puzzle.id);
  const first = ratePuzzle(puzzle.grid);
  const second = ratePuzzle(puzzle.grid);
  assert.equal(first.status, "solved", `${puzzle.id} must solve logically`);
  assert.equal(first.level, puzzle.expectedLevel, `${puzzle.id} must retain its compiled difficulty`);
  assert.equal(first.solutionCount, 1, `${puzzle.id} must have exactly one solution`);
  assert.equal(first.solution.join(""), puzzle.solution, `${puzzle.id} must match its compiled solution`);
  assert.equal(first.steps, puzzle.steps, `${puzzle.id} must retain its deterministic step count`);
  assert.deepEqual(first.techniqueCounts, second.techniqueCounts, `${puzzle.id} technique metadata must be stable`);
  assert.deepEqual(findGenuinelyRequiredTechniques(puzzle.grid), puzzle.required, `${puzzle.id} required techniques must be disablement-certified`);
  assert.equal(certifyPuzzle(puzzle.grid, { requiredTechniques: puzzle.required }).certified, true, `${puzzle.id} required techniques must certify`);
}
console.log(`catalog verification passed: ${entries.length} puzzles, ${ids.size} canonical identities`);

async function canonicalize(puzzles) {
  const workers = Array.from({ length: Math.min(4, availableParallelism()) }, () => new Worker(new URL("./canonical-worker.mjs", import.meta.url)));
  const results = new Array(puzzles.length);
  let cursor = 0;
  let completed = 0;
  return new Promise((resolve, reject) => {
    const send = (worker) => {
      if (cursor < puzzles.length) {
        const index = cursor++;
        worker.postMessage({ index, grid: puzzles[index].grid });
      }
    };
    for (const worker of workers) {
      worker.on("message", (result) => {
        results[result.index] = result;
        completed += 1;
        if (completed % 50 === 0) console.log(`verified canonical identities ${completed}/${puzzles.length}`);
        if (completed === puzzles.length) Promise.all(workers.map((item) => item.terminate())).then(() => resolve(results), reject);
        else send(worker);
      });
      worker.on("error", reject);
      send(worker);
    }
  });
}
