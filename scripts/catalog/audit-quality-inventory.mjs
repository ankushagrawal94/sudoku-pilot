import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { PRODUCTION_GATE_THRESHOLDS } from "./quality.mjs";

const root = new URL("../../", import.meta.url);
const state = new URL(process.argv[2] || ".catalog-build/catalog.sqlite", root);
if (!existsSync(state)) throw new Error(`Local catalog archive does not exist: ${state.pathname}`);
const baseline = JSON.parse(await readFile(new URL("resources/catalog-quality-baseline.json", root), "utf8"));
const database = new DatabaseSync(state.pathname, { readOnly: true });
const levels = {};

for (const level of ["expert", "extreme"]) {
  const rows = database.prepare(`SELECT c.*,a.canonical_id accepted_canonical_id
    FROM accepted a JOIN candidates c ON c.id=a.candidate_id
    WHERE a.difficulty=? ORDER BY a.canonical_id`).all(level);
  const lineages = countValues(rows.map((row) => row.lineage_root_id));
  const gateTechniques = {};
  const gatePositionBands = {};
  const techniqueCoverage = {};
  for (const row of rows) {
    for (const technique of JSON.parse(row.gate_techniques || "[]")) increment(gateTechniques, technique);
    for (const position of JSON.parse(row.gate_positions || "[]")) increment(gatePositionBands, `${Math.floor((position - 1) / 10) * 10 + 1}-${Math.floor((position - 1) / 10) * 10 + 10}`);
    for (const technique of Object.keys(JSON.parse(row.technique_metadata || "{}"))) increment(techniqueCoverage, technique);
  }
  levels[level] = {
    count: rows.length,
    canonicalIdentities: new Set(rows.map((row) => row.accepted_canonical_id)).size,
    gateCountDistribution: countValues(rows.map((row) => row.gate_count)),
    gateTechniques,
    gatePositionBands,
    techniqueCoverage,
    clueCounts: distributionSummary(rows.map((row) => row.clue_count)),
    steps: distributionSummary(rows.map((row) => row.step_count)),
    lineages: {
      count: Object.keys(lineages).length,
      maximumContribution: Math.max(...Object.values(lineages)),
      contributions: lineages
    }
  };
}

const attempts = database.prepare(`SELECT requested_level,status,COALESCE(rejection_reason,'qualifying') reason,COUNT(*) count
  FROM candidates WHERE producer='Sudoku Pilot hard-gate search'
  GROUP BY requested_level,status,rejection_reason ORDER BY requested_level,count DESC`).all();
const producer = {};
for (const level of ["expert", "extreme"]) {
  const rows = attempts.filter((row) => row.requested_level === level);
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  const qualifying = rows.filter((row) => row.reason === "qualifying").reduce((sum, row) => sum + row.count, 0);
  producer[level] = {
    attempts: total,
    qualifying,
    qualifyingRate: qualifying / total,
    results: Object.fromEntries(rows.map((row) => [`${row.status}:${row.reason}`, row.count]))
  };
}

const originalInventory = {};
for (const level of ["expert", "extreme"]) {
  originalInventory[level] = database.prepare(`SELECT status,COALESCE(rejection_reason,'qualifying') reason,COUNT(*) count
    FROM candidates WHERE id<=3209 AND requested_level=? GROUP BY status,rejection_reason ORDER BY count DESC`).all(level);
}

const audit = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  metric: {
    id: "deterministic-certified-path-v1",
    interpretation: "Observed hard gates on Sudoku Pilot's stable deterministic certified path; not a mathematical minimum over every possible solving path.",
    productionThresholds: PRODUCTION_GATE_THRESHOLDS
  },
  baseline,
  replacement: { levels },
  originalWarehouseReevaluation: originalInventory,
  producer,
  resumeCommands: {
    reevaluate: "vercel env run -e production -- npm run catalog:quality:reevaluate -- --levels expert,extreme",
    generateExpert: "vercel env run -e production -- npm run catalog:quality:generate -- --levels expert --pool 120 --max-per-lineage 10 --max-empty-lineage-attempts 2000",
    generateExtreme: "vercel env run -e production -- npm run catalog:quality:generate -- --levels extreme --pool 120 --max-per-lineage 10 --max-empty-lineage-attempts 2000",
    select: "vercel env run -e production -- npm run catalog:build -- --levels expert,extreme --pool 150 --extreme-pool 150 --max-per-lineage 10"
  }
};

database.close();
await writeFile(new URL("output/catalog-quality-audit.json", root), `${JSON.stringify(audit, null, 2)}\n`);
console.log("catalog quality audit written");

function increment(target, key) { target[key] = (target[key] || 0) + 1; }
function countValues(values) {
  const counts = {};
  for (const value of values) increment(counts, value);
  return Object.fromEntries(Object.entries(counts).sort((a, b) => Number(a[0]) - Number(b[0])));
}
function distributionSummary(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return { min: sorted[0], median: sorted[Math.floor((sorted.length - 1) / 2)], max: sorted.at(-1), distribution: countValues(sorted) };
}
