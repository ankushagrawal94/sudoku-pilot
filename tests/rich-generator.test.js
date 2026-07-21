import assert from "node:assert/strict";
import { frontierScore, mutationFor } from "../scripts/catalog/rich-generator.mjs";

const solution = "123456789456789123789123456234567891567891234891234567345678912678912345912345678";
const grid = [...solution].map((cell, index) => index % 3 ? "0" : cell).join("");
const parent = { id: 42, grid, solution, gateCount: 3, gateStatus: "solved" };
const first = mutationFor(parent, { level: "extreme", cursor: 7 });
const repeat = mutationFor(parent, { level: "extreme", cursor: 7 });
assert.deepEqual(first, repeat, "the same persisted cursor must reproduce the same mutation");
assert.notEqual(first.grid, grid);
for (let index = 0; index < 81; index += 1) {
  assert.ok(first.grid[index] === "0" || first.grid[index] === solution[index], "mutations may only use solution-consistent clues");
}
assert.notDeepEqual(mutationFor(parent, { level: "extreme", cursor: 8 }), first, "advancing the cursor must advance the search");

const weak = { requestedLevel: "extreme", ratedLevel: "extreme", gateCount: 2, gateStatus: "solved", clueCount: 26, stepCount: 50, status: "rejected" };
const richer = { ...weak, gateCount: 5 };
assert.ok(frontierScore(richer) > frontierScore(weak), "the frontier must prefer candidates closer to the production gate bar");
assert.ok(frontierScore({ ...richer, status: "eligible" }) > frontierScore(richer), "certified eligible parents should remain useful diversity seeds");

console.log("rich-generator tests passed");
