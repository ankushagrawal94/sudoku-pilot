import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { ensureLocalArchiveIdentity, resolveWarehouseConnectionString, syncLocalArchive } from "./warehouse.mjs";
import {
  ensureQualityColumns,
  evaluateCatalogCandidate,
  persistCandidateEvaluation,
  recoverPendingCandidateEvaluations,
  PRODUCTION_GATE_THRESHOLDS
} from "./quality.mjs";

const options = parseOptions(process.argv.slice(2));
if (!existsSync(options.state)) throw new Error(`Local catalog archive does not exist: ${options.state}`);
const database = new DatabaseSync(options.state);
database.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;");
ensureQualityColumns(database);
ensureLocalArchiveIdentity(database);
database.exec("CREATE TABLE IF NOT EXISTS build_state (key TEXT PRIMARY KEY, value INTEGER NOT NULL)");
const recoveredPending = recoverPendingCandidateEvaluations(database, {
  levels: options.levels,
  gateThresholds: options.gateThresholds
});
if (recoveredPending) console.log(JSON.stringify({ recoveredPending }));

if (options.resetCursor) {
  for (const level of options.levels) database.prepare("DELETE FROM build_state WHERE key=?").run(`quality-reevaluation-cursor:${level}`);
}

let processed = 0;
try {
  for (const level of options.levels) {
    const key = `quality-reevaluation-cursor:${level}`;
    database.prepare("INSERT OR IGNORE INTO build_state(key,value) VALUES (?,0)").run(key);
    let cursor = database.prepare("SELECT value FROM build_state WHERE key=?").get(key).value;
    const rows = database.prepare("SELECT id,grid,solution FROM candidates WHERE requested_level=? AND id>? ORDER BY id").all(level, cursor);
    for (const row of rows) {
      if (processed >= options.limit) break;
      const evaluation = evaluateCatalogCandidate(row.grid, row.solution, level, { gateThresholds: options.gateThresholds });
      database.exec("BEGIN");
      try {
        persistCandidateEvaluation(database, row.id, evaluation, row.solution);
        database.prepare("UPDATE build_state SET value=? WHERE key=?").run(row.id, key);
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
      cursor = row.id;
      processed += 1;
      if (processed % options.checkpointEvery === 0) {
        await checkpoint(database, `catalog-quality-reevaluation:${level}`);
        report(database, level, cursor, processed);
      }
    }
    report(database, level, cursor, processed);
    if (processed >= options.limit) break;
  }
  await checkpoint(database, "catalog-quality-reevaluation");
} finally {
  database.close();
}

function report(database, level, cursor, count) {
  const inventory = database.prepare(`SELECT status,rejection_reason,COUNT(*) count FROM candidates
    WHERE requested_level=? AND id<=? GROUP BY status,rejection_reason ORDER BY count DESC`).all(level, cursor);
  console.log(JSON.stringify({ level, cursor, processed: count, inventory }));
}

async function checkpoint(database, sourceLabel) {
  if (!options.warehouseUrl) return;
  const counts = await syncLocalArchive(database, { connectionString: options.warehouseUrl, sourceLabel });
  console.log(JSON.stringify({ checkpoint: sourceLabel, counts }));
}

function parseOptions(args) {
  const value = (name, fallback) => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : fallback;
  };
  const levels = value("--levels", "expert,extreme").split(",").map((item) => item.trim()).filter(Boolean);
  if (levels.some((level) => !["expert", "extreme"].includes(level))) throw new Error("--levels only accepts expert and extreme");
  const limitValue = value("--limit", "Infinity");
  return {
    state: value("--state", ".catalog-build/catalog.sqlite"),
    levels,
    limit: limitValue === "Infinity" ? Infinity : Number(limitValue),
    checkpointEvery: Number(value("--checkpoint-every", 100)),
    resetCursor: args.includes("--reset-cursor"),
    warehouseUrl: value("--warehouse-url", resolveWarehouseConnectionString()),
    gateThresholds: {
      expert: Number(value("--min-expert-gates", PRODUCTION_GATE_THRESHOLDS.expert)),
      extreme: Number(value("--min-extreme-gates", PRODUCTION_GATE_THRESHOLDS.extreme))
    }
  };
}
