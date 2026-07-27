import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import pg from "pg";

const connectionString = process.env.ACCOUNT_DATABASE_URL_UNPOOLED;
if (!connectionString) throw new Error("ACCOUNT_DATABASE_URL_UNPOOLED is required.");

const migrationUrl = new URL("../../database/account/001_account_sync.sql", import.meta.url);
const sql = await readFile(fileURLToPath(migrationUrl), "utf8");
const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

try {
  await client.connect();
  await client.query(sql);
  console.log("Applied account migration 001_account_sync.");
} finally {
  await client.end();
}
