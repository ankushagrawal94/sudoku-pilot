import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import pg from "pg";

const connectionString = process.env.ACCOUNT_DATABASE_URL_UNPOOLED;
if (!connectionString) throw new Error("ACCOUNT_DATABASE_URL_UNPOOLED is required.");

const migrationDirectoryUrl = new URL("../../database/account/", import.meta.url);
const migrationNames = (await readdir(fileURLToPath(migrationDirectoryUrl)))
  .filter((name) => /^\d+_[a-z0-9_]+\.sql$/.test(name))
  .sort();
const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

try {
  await client.connect();
  for (const migrationName of migrationNames) {
    const sql = await readFile(fileURLToPath(new URL(migrationName, migrationDirectoryUrl)), "utf8");
    await client.query(sql);
    console.log(`Applied account migration ${migrationName}.`);
  }
} finally {
  await client.end();
}
