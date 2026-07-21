CREATE SCHEMA IF NOT EXISTS puzzle_warehouse;
REVOKE ALL ON SCHEMA puzzle_warehouse FROM PUBLIC;

CREATE TABLE IF NOT EXISTS puzzle_warehouse.schema_migrations (
  version integer PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS puzzle_warehouse.archive_sources (
  archive_id uuid PRIMARY KEY,
  source_label text NOT NULL,
  created_at timestamptz NOT NULL,
  first_synced_at timestamptz NOT NULL DEFAULT now(),
  last_synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS puzzle_warehouse.provenance (
  provenance_id text PRIMARY KEY,
  producer text NOT NULL,
  version text NOT NULL,
  source_url text,
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS puzzle_warehouse.puzzles (
  puzzle_key text PRIMARY KEY,
  grid char(81) NOT NULL UNIQUE,
  solution char(81),
  clue_count smallint,
  canonical_id text,
  canonical_grid char(81),
  first_seen_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  CONSTRAINT puzzle_grid_format CHECK (grid ~ '^[0-9]{81}$'),
  CONSTRAINT puzzle_solution_format CHECK (solution IS NULL OR solution ~ '^[1-9]{81}$'),
  CONSTRAINT puzzle_canonical_grid_format CHECK (canonical_grid IS NULL OR canonical_grid ~ '^[0-9]{81}$')
);

CREATE INDEX IF NOT EXISTS puzzles_canonical_id_idx
  ON puzzle_warehouse.puzzles (canonical_id)
  WHERE canonical_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS puzzle_warehouse.generation_events (
  event_key text PRIMARY KEY,
  archive_id uuid NOT NULL REFERENCES puzzle_warehouse.archive_sources(archive_id),
  local_candidate_id bigint NOT NULL,
  puzzle_key text NOT NULL REFERENCES puzzle_warehouse.puzzles(puzzle_key),
  requested_level text NOT NULL,
  producer text NOT NULL,
  producer_version text NOT NULL,
  provenance_id text NOT NULL REFERENCES puzzle_warehouse.provenance(provenance_id),
  parent_id text,
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
  generated_at timestamptz NOT NULL,
  UNIQUE (archive_id, local_candidate_id)
);

CREATE INDEX IF NOT EXISTS generation_events_puzzle_idx
  ON puzzle_warehouse.generation_events (puzzle_key, generated_at);

CREATE TABLE IF NOT EXISTS puzzle_warehouse.evaluations (
  evaluation_key text PRIMARY KEY,
  event_key text NOT NULL REFERENCES puzzle_warehouse.generation_events(event_key),
  solver_version text NOT NULL,
  candidate_status text NOT NULL,
  rejection_reason text,
  rated_level text,
  step_count integer,
  technique_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  required_techniques jsonb NOT NULL DEFAULT '[]'::jsonb,
  full_trace jsonb NOT NULL DEFAULT '[]'::jsonb,
  evaluated_solution char(81),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT evaluation_solution_format CHECK (evaluated_solution IS NULL OR evaluated_solution ~ '^[1-9]{81}$')
);

CREATE INDEX IF NOT EXISTS evaluations_event_idx
  ON puzzle_warehouse.evaluations (event_key, recorded_at);

CREATE TABLE IF NOT EXISTS puzzle_warehouse.catalog_snapshots (
  snapshot_key text PRIMARY KEY,
  archive_id uuid NOT NULL REFERENCES puzzle_warehouse.archive_sources(archive_id),
  source_label text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS puzzle_warehouse.catalog_memberships (
  snapshot_key text NOT NULL REFERENCES puzzle_warehouse.catalog_snapshots(snapshot_key),
  puzzle_key text NOT NULL REFERENCES puzzle_warehouse.puzzles(puzzle_key),
  canonical_id text NOT NULL,
  difficulty text NOT NULL,
  accepted_at timestamptz NOT NULL,
  PRIMARY KEY (snapshot_key, puzzle_key)
);

CREATE TABLE IF NOT EXISTS puzzle_warehouse.sync_runs (
  sync_id uuid PRIMARY KEY,
  archive_id uuid NOT NULL REFERENCES puzzle_warehouse.archive_sources(archive_id),
  solver_version text NOT NULL,
  source_label text NOT NULL,
  counts jsonb NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO puzzle_warehouse.schema_migrations(version)
VALUES (1)
ON CONFLICT (version) DO NOTHING;

ALTER TABLE puzzle_warehouse.schema_migrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE puzzle_warehouse.archive_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE puzzle_warehouse.provenance ENABLE ROW LEVEL SECURITY;
ALTER TABLE puzzle_warehouse.puzzles ENABLE ROW LEVEL SECURITY;
ALTER TABLE puzzle_warehouse.generation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE puzzle_warehouse.evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE puzzle_warehouse.catalog_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE puzzle_warehouse.catalog_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE puzzle_warehouse.sync_runs ENABLE ROW LEVEL SECURITY;
