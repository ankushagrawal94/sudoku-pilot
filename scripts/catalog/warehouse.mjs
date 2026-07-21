import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";

const { Client } = pg;
const SCHEMA_URL = new URL("../../resources/puzzle-warehouse-schema.sql", import.meta.url);
const BATCH_SIZE = 250;

export const DEFAULT_SOLVER_VERSION = "sudoku-pilot-solver-v1";

export function resolveWarehouseConnectionString(environment = process.env) {
  return environment.PUZZLE_WAREHOUSE_URL
    || environment.PUZZLE_WAREHOUSE_DATABASE_URL_UNPOOLED;
}

export function ensureLocalArchiveIdentity(database) {
  database.exec(`CREATE TABLE IF NOT EXISTS archive_metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`);
  const existing = database.prepare("SELECT value FROM archive_metadata WHERE key='archive_id'").get();
  if (existing?.value) return existing.value;
  const archiveId = randomUUID();
  database.prepare("INSERT INTO archive_metadata(key,value) VALUES ('archive_id',?)").run(archiveId);
  database.prepare("INSERT INTO archive_metadata(key,value) VALUES ('created_at',datetime('now'))").run();
  return archiveId;
}

export function readLocalArchive(database, {
  solverVersion = process.env.PUZZLE_SOLVER_VERSION || DEFAULT_SOLVER_VERSION,
  sourceLabel = "catalog-build"
} = {}) {
  const archiveId = ensureLocalArchiveIdentity(database);
  const archiveCreatedAt = database.prepare("SELECT value FROM archive_metadata WHERE key='created_at'").get()?.value || new Date().toISOString();
  const provenance = database.prepare("SELECT * FROM provenance ORDER BY id").all().map((row) => ({
    provenance_id: row.id,
    producer: row.producer,
    version: row.version,
    source_url: row.source_url,
    configuration: parseJson(row.configuration, {})
  }));
  const acceptedByCandidate = new Map(database.prepare("SELECT * FROM accepted ORDER BY candidate_id").all().map((row) => [row.candidate_id, row]));
  const candidates = database.prepare("SELECT * FROM candidates ORDER BY id").all();
  const puzzles = [];
  const events = [];
  const evaluations = [];
  const memberships = [];

  for (const row of candidates) {
    const puzzleKey = fingerprint("puzzle", row.grid);
    const eventKey = fingerprint("generation", archiveId, String(row.id));
    const techniqueCounts = parseJson(row.technique_metadata, {});
    const requiredTechniques = parseJson(row.required_techniques, []);
    const fullTrace = parseJson(row.full_trace, []);
    const evaluationKey = fingerprint("evaluation", eventKey, solverVersion, stableJson({
      status: row.status,
      rejectionReason: row.rejection_reason,
      ratedLevel: row.rated_level,
      stepCount: row.step_count,
      techniqueCounts,
      requiredTechniques,
      fullTrace,
      solution: row.solution
    }));
    puzzles.push({
      puzzle_key: puzzleKey,
      grid: row.grid,
      solution: normalizeSolution(row.solution),
      clue_count: row.clue_count,
      canonical_id: row.canonical_id,
      canonical_grid: row.canonical_grid,
      first_seen_at: asUtc(row.created_at),
      last_seen_at: asUtc(row.created_at)
    });
    events.push({
      event_key: eventKey,
      archive_id: archiveId,
      local_candidate_id: row.id,
      puzzle_key: puzzleKey,
      requested_level: row.requested_level,
      producer: row.producer,
      producer_version: row.producer_version,
      provenance_id: row.provenance_id,
      parent_id: row.parent_id,
      configuration: parseJson(row.configuration, {}),
      generated_at: asUtc(row.created_at)
    });
    evaluations.push({
      evaluation_key: evaluationKey,
      event_key: eventKey,
      solver_version: solverVersion,
      candidate_status: row.status,
      rejection_reason: row.rejection_reason,
      rated_level: row.rated_level,
      step_count: row.step_count,
      technique_counts: techniqueCounts,
      required_techniques: requiredTechniques,
      full_trace: fullTrace,
      evaluated_solution: normalizeSolution(row.solution)
    });
    const accepted = acceptedByCandidate.get(row.id);
    if (accepted) memberships.push({
      puzzle_key: puzzleKey,
      canonical_id: accepted.canonical_id,
      difficulty: accepted.difficulty,
      accepted_at: asUtc(accepted.accepted_at)
    });
  }

  const snapshotKey = memberships.length ? fingerprint("catalog", archiveId, stableJson(memberships)) : null;
  return {
    archive: { archive_id: archiveId, source_label: sourceLabel, created_at: asUtc(archiveCreatedAt) },
    solverVersion,
    sourceLabel,
    provenance,
    puzzles,
    events,
    evaluations,
    snapshot: snapshotKey ? { snapshot_key: snapshotKey, archive_id: archiveId, source_label: sourceLabel } : null,
    memberships: memberships.map((row) => ({ ...row, snapshot_key: snapshotKey }))
  };
}

export async function syncLocalArchive(database, {
  connectionString = resolveWarehouseConnectionString(),
  solverVersion,
  sourceLabel
} = {}) {
  if (!connectionString) throw new Error("PUZZLE_WAREHOUSE_URL or PUZZLE_WAREHOUSE_DATABASE_URL_UNPOOLED is required to sync the durable puzzle warehouse.");
  const records = readLocalArchive(database, { solverVersion, sourceLabel });
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query("SET TIME ZONE 'UTC'");
    await client.query(await readFile(SCHEMA_URL, "utf8"));
    await client.query("BEGIN");
    await client.query(`INSERT INTO puzzle_warehouse.archive_sources(archive_id,source_label,created_at)
      VALUES ($1,$2,$3) ON CONFLICT (archive_id) DO UPDATE SET source_label=excluded.source_label,last_synced_at=now()`,
    [records.archive.archive_id, records.archive.source_label, records.archive.created_at]);
    await insertBatches(client, records.provenance, insertProvenance);
    await insertBatches(client, records.puzzles, insertPuzzles);
    await insertBatches(client, records.events, insertEvents);
    await insertBatches(client, records.evaluations, insertEvaluations);
    if (records.snapshot) {
      await client.query(`INSERT INTO puzzle_warehouse.catalog_snapshots(snapshot_key,archive_id,source_label)
        VALUES ($1,$2,$3) ON CONFLICT (snapshot_key) DO NOTHING`,
      [records.snapshot.snapshot_key, records.snapshot.archive_id, records.snapshot.source_label]);
      await insertBatches(client, records.memberships, insertMemberships);
    }
    const counts = archiveCounts(records);
    await client.query(`INSERT INTO puzzle_warehouse.sync_runs(sync_id,archive_id,solver_version,source_label,counts)
      VALUES ($1,$2,$3,$4,$5::jsonb)`, [randomUUID(), records.archive.archive_id, records.solverVersion, records.sourceLabel, JSON.stringify(counts)]);
    await client.query("COMMIT");
    return counts;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

export async function inspectWarehouse(connectionString = resolveWarehouseConnectionString()) {
  if (!connectionString) throw new Error("PUZZLE_WAREHOUSE_URL or PUZZLE_WAREHOUSE_DATABASE_URL_UNPOOLED is required to inspect the durable puzzle warehouse.");
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const result = await client.query(`SELECT
      (SELECT count(*)::integer FROM puzzle_warehouse.puzzles) puzzles,
      (SELECT count(*)::integer FROM puzzle_warehouse.generation_events) generation_events,
      (SELECT count(*)::integer FROM puzzle_warehouse.evaluations) evaluations,
      (SELECT count(*)::integer FROM puzzle_warehouse.catalog_snapshots) catalog_snapshots,
      (SELECT count(*)::integer FROM puzzle_warehouse.archive_sources) archives`);
    return result.rows[0];
  } finally {
    await client.end();
  }
}

export function archiveCounts(records) {
  return {
    puzzles: records.puzzles.length,
    generationEvents: records.events.length,
    evaluations: records.evaluations.length,
    catalogMemberships: records.memberships.length
  };
}

async function insertBatches(client, rows, insert) {
  for (let index = 0; index < rows.length; index += BATCH_SIZE) {
    await insert(client, rows.slice(index, index + BATCH_SIZE));
  }
}

async function insertProvenance(client, rows) {
  if (!rows.length) return;
  await client.query(`INSERT INTO puzzle_warehouse.provenance(provenance_id,producer,version,source_url,configuration)
    SELECT provenance_id,producer,version,source_url,configuration FROM jsonb_to_recordset($1::jsonb)
      AS x(provenance_id text,producer text,version text,source_url text,configuration jsonb)
    ON CONFLICT (provenance_id) DO UPDATE SET producer=excluded.producer,version=excluded.version,
      source_url=excluded.source_url,configuration=excluded.configuration,last_seen_at=now()`, [JSON.stringify(rows)]);
}

async function insertPuzzles(client, rows) {
  if (!rows.length) return;
  await client.query(`INSERT INTO puzzle_warehouse.puzzles
      (puzzle_key,grid,solution,clue_count,canonical_id,canonical_grid,first_seen_at,last_seen_at)
    SELECT puzzle_key,grid,solution,clue_count,canonical_id,canonical_grid,first_seen_at,last_seen_at
    FROM jsonb_to_recordset($1::jsonb) AS x(puzzle_key text,grid char(81),solution char(81),clue_count smallint,
      canonical_id text,canonical_grid char(81),first_seen_at timestamptz,last_seen_at timestamptz)
    ON CONFLICT (puzzle_key) DO UPDATE SET
      solution=COALESCE(excluded.solution,puzzle_warehouse.puzzles.solution),
      clue_count=COALESCE(excluded.clue_count,puzzle_warehouse.puzzles.clue_count),
      canonical_id=COALESCE(excluded.canonical_id,puzzle_warehouse.puzzles.canonical_id),
      canonical_grid=COALESCE(excluded.canonical_grid,puzzle_warehouse.puzzles.canonical_grid),
      first_seen_at=LEAST(excluded.first_seen_at,puzzle_warehouse.puzzles.first_seen_at),
      last_seen_at=GREATEST(excluded.last_seen_at,puzzle_warehouse.puzzles.last_seen_at)`, [JSON.stringify(rows)]);
}

async function insertEvents(client, rows) {
  if (!rows.length) return;
  await client.query(`INSERT INTO puzzle_warehouse.generation_events
      (event_key,archive_id,local_candidate_id,puzzle_key,requested_level,producer,producer_version,provenance_id,parent_id,configuration,generated_at)
    SELECT event_key,archive_id,local_candidate_id,puzzle_key,requested_level,producer,producer_version,provenance_id,parent_id,configuration,generated_at
    FROM jsonb_to_recordset($1::jsonb) AS x(event_key text,archive_id uuid,local_candidate_id bigint,puzzle_key text,
      requested_level text,producer text,producer_version text,provenance_id text,parent_id text,configuration jsonb,generated_at timestamptz)
    ON CONFLICT (event_key) DO NOTHING`, [JSON.stringify(rows)]);
}

async function insertEvaluations(client, rows) {
  if (!rows.length) return;
  await client.query(`INSERT INTO puzzle_warehouse.evaluations
      (evaluation_key,event_key,solver_version,candidate_status,rejection_reason,rated_level,step_count,technique_counts,required_techniques,full_trace,evaluated_solution)
    SELECT evaluation_key,event_key,solver_version,candidate_status,rejection_reason,rated_level,step_count,technique_counts,required_techniques,full_trace,evaluated_solution
    FROM jsonb_to_recordset($1::jsonb) AS x(evaluation_key text,event_key text,solver_version text,candidate_status text,
      rejection_reason text,rated_level text,step_count integer,technique_counts jsonb,required_techniques jsonb,full_trace jsonb,evaluated_solution char(81))
    ON CONFLICT (evaluation_key) DO NOTHING`, [JSON.stringify(rows)]);
}

async function insertMemberships(client, rows) {
  if (!rows.length) return;
  await client.query(`INSERT INTO puzzle_warehouse.catalog_memberships(snapshot_key,puzzle_key,canonical_id,difficulty,accepted_at)
    SELECT snapshot_key,puzzle_key,canonical_id,difficulty,accepted_at FROM jsonb_to_recordset($1::jsonb)
      AS x(snapshot_key text,puzzle_key text,canonical_id text,difficulty text,accepted_at timestamptz)
    ON CONFLICT (snapshot_key,puzzle_key) DO NOTHING`, [JSON.stringify(rows)]);
}

function fingerprint(...parts) {
  return `sha256:${createHash("sha256").update(parts.join("\u0000")).digest("hex")}`;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function parseJson(value, fallback) {
  if (value == null || value === "") return fallback;
  return typeof value === "string" ? JSON.parse(value) : value;
}

function normalizeSolution(value) {
  if (!value) return null;
  const digits = value.replace(/[^1-9]/g, "");
  return digits.length === 81 ? digits : null;
}

function asUtc(value) {
  if (!value) return new Date().toISOString();
  return /(?:Z|[+-]\d\d:\d\d)$/.test(value) ? value : `${value.replace(" ", "T")}Z`;
}
