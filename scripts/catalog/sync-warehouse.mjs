import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { inspectWarehouse, syncLocalArchive } from "./warehouse.mjs";

const options = parseOptions(process.argv.slice(2));
if (!options.connectionString) throw new Error("PUZZLE_WAREHOUSE_URL is required to sync the durable puzzle warehouse.");
if (!existsSync(options.state)) throw new Error(`Local catalog archive does not exist: ${options.state}`);
const database = new DatabaseSync(options.state);
try {
  const synced = await syncLocalArchive(database, {
    connectionString: options.connectionString,
    solverVersion: options.solverVersion,
    sourceLabel: options.sourceLabel
  });
  const warehouse = await inspectWarehouse(options.connectionString);
  console.log(JSON.stringify({ state: options.state, synced, warehouse }, null, 2));
} finally {
  database.close();
}

function parseOptions(args) {
  const value = (name, fallback) => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : fallback;
  };
  return {
    state: value("--state", ".catalog-build/catalog.sqlite"),
    connectionString: value("--url", process.env.PUZZLE_WAREHOUSE_URL),
    solverVersion: value("--solver-version", process.env.PUZZLE_SOLVER_VERSION),
    sourceLabel: value("--source-label", "catalog-build")
  };
}
