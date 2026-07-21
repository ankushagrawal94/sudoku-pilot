import { readFile, writeFile } from "node:fs/promises";
import { analyzeMinimumHardGates } from "../../src/difficulty.js";

const root = new URL("../../", import.meta.url);
const nodeLimit = Number(process.argv[2] || 10_000);
const sampleSize = Number(process.argv[3] || 3);
const results = {};
for (const level of ["expert", "extreme"]) {
  const rows = JSON.parse(await readFile(new URL(`src/catalog/${level}.json`, root), "utf8"));
  const indexes = [...new Set(Array.from({ length: sampleSize }, (_, index) => Math.round(index * (rows.length - 1) / Math.max(1, sampleSize - 1))))];
  results[level] = indexes.map((index) => ({
    id: rows[index].id,
    ...analyzeMinimumHardGates(rows[index].grid, { level, nodeLimit })
  }));
}
const audit = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  purpose: "Bounded feasibility probe for proving a minimum hard-gate count across all supported move orders.",
  caveat: "Only status=proven establishes an exact minimum. Inconclusive results preserve the deterministic count solely as an observed upper bound.",
  nodeLimit,
  sampleSize,
  results
};
await writeFile(new URL("output/hard-gate-minimum-audit.json", root), `${JSON.stringify(audit, null, 2)}\n`);
console.log(JSON.stringify(audit, null, 2));
