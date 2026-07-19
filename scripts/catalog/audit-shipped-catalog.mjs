import { readFile, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { DIFFICULTY_ORDER } from "../../src/difficulty.js";
import { ALL_TECHNIQUES } from "../../src/puzzles.js";

const root = new URL("../../", import.meta.url);
const counts = {};
const techniques = {};
const requiredTechniques = {};
const sizes = {};
const rowsByLevel = {};

for (const level of DIFFICULTY_ORDER) {
  const url = new URL(`src/catalog/${level}.json`, root);
  const json = await readFile(url, "utf8");
  const rows = JSON.parse(json);
  rowsByLevel[level] = rows;
  counts[level] = rows.length;
  techniques[level] = countTechniques(rows);
  requiredTechniques[level] = countRequiredTechniques(rows);
  sizes[level] = { bytes: Buffer.byteLength(json), gzipBytes: gzipSync(json).byteLength };
}

const gaps = coverageGaps(techniques, rowsByLevel.hard);
const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
const audit = {
  schemaVersion: 2,
  scope: "shipped-catalog",
  generatedAt: new Date().toISOString(),
  commands: { rebuild: "npm run catalog:rebuild", audit: "npm run catalog:audit", verify: "npm run catalog:verify" },
  catalog: {
    targetPerLevel: 100,
    total,
    counts,
    techniques,
    requiredTechniques,
    hardLockedCoverage: lockedCoverage(rowsByLevel.hard),
    sizes,
    totalBytes: Object.values(sizes).reduce((sum, item) => sum + item.bytes, 0),
    totalGzipBytes: Object.values(sizes).reduce((sum, item) => sum + item.gzipBytes, 0)
  },
  metadata: [
    { id: "local:sudoku-pilot-augmentation@1", producer: "Sudoku Pilot clue augmentation", version: "1" },
    { id: "local:sudoku-pilot-extreme@1", producer: "Sudoku Pilot Extreme clue augmentation", version: "1" },
    { id: "npm:sudoku-gen@1.0.2", producer: "sudoku-gen", version: "1.0.2" }
  ],
  knownCoverageGaps: gaps
};

await writeFile(new URL("output/catalog-audit.json", root), `${JSON.stringify(audit, null, 2)}\n`);
console.log(`catalog audit written: ${total} puzzles`);

function countTechniques(rows) {
  const result = Object.fromEntries(ALL_TECHNIQUES.map((technique) => [technique, 0]));
  for (const row of rows) for (const technique of row.techniques) result[technique] += 1;
  return Object.fromEntries(Object.entries(result).filter(([, count]) => count));
}

function countRequiredTechniques(rows) {
  const result = {};
  for (const row of rows) for (const technique of row.required) result[technique] = (result[technique] || 0) + 1;
  return result;
}

function lockedCoverage(rows) {
  const result = { pointingOnly: 0, claimingOnly: 0, mixed: 0 };
  for (const row of rows) {
    const pointing = row.techniques.includes("Pointing Candidates");
    const claiming = row.techniques.includes("Claiming Candidates");
    if (pointing && claiming) result.mixed += 1;
    else if (pointing) result.pointingOnly += 1;
    else if (claiming) result.claimingOnly += 1;
  }
  return result;
}

function coverageGaps(actual, hardRows) {
  const desired = {
    hard: ["Pointing Candidates", "Claiming Candidates"],
    expert: ["Naked Pair", "Hidden Pair", "Naked Triple", "Hidden Triple", "Naked Quadruple", "Hidden Quadruple"],
    extreme: ["X-Wing", "Swordfish", "Jellyfish", "Skyscraper", "2-String Kite", "Crane", "XY-Wing", "XYZ-Wing", "W-Wing", "Simple Colouring", "Empty Rectangle"]
  };
  const result = [];
  for (const [level, list] of Object.entries(desired)) {
    for (const technique of list) if (!(actual[level][technique] || 0)) result.push({ level, technique, target: 1, actual: 0, shortage: 1 });
  }
  if (!lockedCoverage(hardRows).claimingOnly) result.push({ level: "hard", technique: "Claiming Candidates without Pointing Candidates", target: 1, actual: 0, shortage: 1 });
  return result;
}
