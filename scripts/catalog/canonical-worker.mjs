import { parentPort } from "node:worker_threads";
import { canonicalPuzzleId } from "./canonical.mjs";

parentPort.on("message", ({ index, grid }) => {
  parentPort.postMessage({ index, ...canonicalPuzzleId(grid) });
});
