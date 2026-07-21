# Production catalog pipeline

Sudoku Pilot builds its browser catalog offline. The browser receives compact puzzle records, not generator state or full solving traces.

## Working state and durable source of truth

The resumable working state is `.catalog-build/catalog.sqlite`. It records:

- every candidate grid and supplied solution;
- requested and rated difficulty;
- producer, version, configuration, parent seed, and provenance record;
- clue count, step count, stable technique counts, and full logical trace;
- deterministic hard-gate count, gate techniques, trace positions, effort metadata, and lineage root;
- rejection status and exact rejection reason;
- the exact canonical grid and its SHA-256 canonical ID for selected candidates; and
- accepted inventory with unique constraints on canonical ID and canonical grid.

The directory is gitignored because it is transient build and audit state. The durable source of truth is a provider-neutral Postgres database using `resources/puzzle-warehouse-schema.sql`. It retains:

- one stable identity per exact puzzle grid;
- every generation event, including repeated generation of the same grid in different archive runs;
- append-only, solver-versioned evaluations and complete traces;
- provenance metadata; and
- immutable catalog snapshots and their memberships.

The durable warehouse is a private Neon database provisioned through Vercel Marketplace as `sudoku-puzzle-warehouse`, connected to Development, Preview, and Production with the `PUZZLE_WAREHOUSE_` prefix. The scripts use the generated direct connection string in `PUZZLE_WAREHOUSE_DATABASE_URL_UNPOOLED`; `PUZZLE_WAREHOUSE_URL` remains a provider-neutral explicit override. When either is set, the catalog syncs automatically after each completed difficulty and after catalog compilation. The sync is transactional and idempotent: repeating it does not duplicate puzzles, events, evaluations, or snapshots. A changed result or solver version creates a new evaluation rather than overwriting history.

## Candidate producers

`sudoku-gen` 1.0.2 supplies fresh offline candidates. Sudoku Pilot does not trust the producer's label or solution without checking both.

The earlier clue-augmentation producers remain in the warehouse as historical provenance. Adding solution-consistent clues can preserve or reduce difficulty, so it is not used to manufacture the richer Expert and Extreme inventory. `sudoku-pilot-hard-gate-search@1` instead performs seeded clue removal, addition, and swap mutations, keeps a scored frontier, and records every unique attempt, parent, lineage, seed, cursor, mutation, evaluation, and rejection. SQLite cursors and periodic Neon checkpoints make long searches resumable. The producer is never final authority: Sudoku Pilot independently checks uniqueness, solution agreement, logical completion, rating stability, distribution, hard gates, and canonical identity.

QQWing was evaluated from its official site: version 1.3.4 is available as GPL-2.0-or-later source and can generate quickly, but its published difficulty model includes guesses and does not optimize Sudoku Pilot hard gates. HoDoKu's official SourceForge project exposes a strong human-style analyzer and source archives, but the current official project metadata did not provide a sufficiently explicit license statement for importing or adapting it here. Neither tool nor any third-party puzzle corpus is incorporated in the shipped inventory.

## Quality and certification

Every accepted puzzle must:

1. have exactly one solution;
2. match the producer-supplied solution, when one was supplied;
3. solve completely with Sudoku Pilot's supported logical techniques;
4. rate to the requested canonical level on two deterministic runs;
5. have stable step and technique metadata;
6. contain 17 to 45 clues, 1 to 200 logical steps, and at least one clue in every row, column, and box; and
7. have a unique exact canonical identity.

Expert and Extreme also require at least five deterministic tier-level hard gates. For Expert, the evaluator exhausts techniques through Hard; when stuck, it applies exactly one Expert subset move, counts a gate, and exhausts lower techniques again. A puzzle that needs an Extreme move fails the Expert ceiling. For Extreme, the evaluator similarly exhausts techniques through Expert before counting one Extreme move. The stored result is one stable, certified deterministic path, not a claim about the mathematical minimum across every possible move order. `catalog:gates:analyze-minimum` runs an optional bounded all-move-order proof search and labels a minimum only when the search completes.

Required techniques use disablement certification. A technique is listed as genuinely required only if the full profile solves the puzzle and removing that technique from the same profile prevents completion. An excluded-technique request is eligible only when a complete path exists with every excluded technique disabled.

## Exact equivalence

Canonicalization enumerates the complete Sudoku equivalence group used by the product: digit relabeling, row swaps within bands, band swaps, column swaps within stacks, stack swaps, and transposition. Rotations and reflections are compositions of those operations. The lexicographically minimum digit-normalized puzzle grid is hashed as a `c1-` SHA-256 ID. The SQLite catalog enforces uniqueness on both the canonical grid and ID.

## Coverage selection

The collector retains a pool larger than the final catalog. A deterministic greedy pass then favors underrepresented clue-count ranges, step-count ranges, opening clue masks, hard-gate bands, gate positions, gate techniques, and named subset/advanced techniques. Expert and Extreme selection defaults to at most ten entries from one ancestry root. The audit report records actual counts and exact gaps; the compiler does not lower the five-gate threshold or relabel an easier pattern to fill a rare-technique bucket.

## Commands and recovery

```sh
npm run catalog:build    # resume existing SQLite state
npm run catalog:rebuild  # archive existing state, then rebuild
npm run catalog:verify   # optional: independently verify every shipped entry
npm run catalog:warehouse:sync     # migrate/sync local SQLite into Postgres
npm run catalog:warehouse:inspect  # report durable archive counts
npm run catalog:quality:reevaluate # resumably apply the current quality evaluator
npm run catalog:quality:generate   # resumably search for richer Expert/Extreme candidates
npm run catalog:quality:audit      # write before/after inventory evidence
npm run catalog:gates:analyze-minimum # bounded stronger-path feasibility probe
```

The warehouse commands require `PUZZLE_WAREHOUSE_URL` or `PUZZLE_WAREHOUSE_DATABASE_URL_UNPOOLED`. For the linked Vercel project, run them with `vercel env run -e production -- ...`; credentials must never be printed or committed. `PUZZLE_SOLVER_VERSION` defaults to `sudoku-pilot-solver-v2-hard-gates` and must be incremented when evaluation semantics change materially. The first sync applies the checked schema automatically.

The warehouse lives in a private `puzzle_warehouse` schema, revokes public schema access, and enables row-level security without public policies. Use a secret owner-level Postgres connection string only in trusted local or CI environments; never expose it to the static browser app.

The compiler can update only selected levels with `--levels expert,extreme`; unaffected shards remain byte-for-byte unchanged. Hard-gate thresholds are configurable for research (`--min-expert-gates` and `--min-extreme-gates`) but production defaults are five. A stopped build can be resumed; startup recovery evaluates any crash-left `pending` attempt before continuing. Run `npm run catalog:verify` when generation changes one or more shipped catalog shards. `catalog:audit` refreshes shipped metadata, while `catalog:quality:audit` records the baseline, replacement distributions, lineage diversity, acceptance rate, and rejection reasons.

A destructive rebuild first syncs the existing SQLite archive when either supported warehouse URL is present. Without a warehouse connection, it stops rather than deleting unsynced data. `node scripts/catalog/build-catalog.mjs --reset --allow-unarchived-reset` is the explicit data-loss escape hatch for disposable test state only.
