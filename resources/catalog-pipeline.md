# Production catalog pipeline

Sudoku Pilot builds its browser catalog offline. The browser receives compact puzzle records, not generator state or full solving traces.

## Source of truth

The resumable build state is `.catalog-build/catalog.sqlite`. It records:

- every candidate grid and supplied solution;
- requested and rated difficulty;
- producer, version, configuration, parent seed, and provenance record;
- clue count, step count, stable technique counts, and full logical trace;
- rejection status and exact rejection reason;
- the exact canonical grid and its SHA-256 canonical ID for selected candidates; and
- accepted inventory with unique constraints on canonical ID and canonical grid.

The directory is gitignored because it is transient build and audit state. Keep it to resume a long build. Remove it only for an intentional clean rebuild.

## Candidate producers

`sudoku-gen` 1.0.2 supplies fresh offline candidates. Sudoku Pilot does not trust the producer's label or solution without checking both.

For Extreme inventory, the local pipeline starts with newly generated Expert puzzles that exceed Sudoku Pilot's supported logical profile. It adds solution-consistent clues until each resulting base is uniquely solvable at Extreme, then derives canonically distinct variants by adding further solution-consistent clues while retaining that rating. The source difficulty, added positions, parent canonical ID, and tool versions are recorded. The generator and augmenter are candidate producers only; Sudoku Pilot's uniqueness checker and supported logical solver are final authority.

## Quality and certification

Every accepted puzzle must:

1. have exactly one solution;
2. match the producer-supplied solution, when one was supplied;
3. solve completely with Sudoku Pilot's supported logical techniques;
4. rate to the requested canonical level on two deterministic runs;
5. have stable step and technique metadata;
6. contain 17 to 45 clues, 1 to 200 logical steps, and at least one clue in every row, column, and box; and
7. have a unique exact canonical identity.

Required techniques use disablement certification. A technique is listed as genuinely required only if the full profile solves the puzzle and removing that technique from the same profile prevents completion. An excluded-technique request is eligible only when a complete path exists with every excluded technique disabled.

## Exact equivalence

Canonicalization enumerates the complete Sudoku equivalence group used by the product: digit relabeling, row swaps within bands, band swaps, column swaps within stacks, stack swaps, and transposition. Rotations and reflections are compositions of those operations. The lexicographically minimum digit-normalized puzzle grid is hashed as a `c1-` SHA-256 ID. The SQLite catalog enforces uniqueness on both the canonical grid and ID.

## Coverage selection

The collector retains a pool larger than the final catalog. A deterministic greedy pass then favors underrepresented clue-count ranges, step-count ranges, opening clue masks, locked-candidate mixes, and named subset/advanced techniques. The audit report records actual counts and exact gaps; the compiler does not relabel an easier pattern to fill a rare-technique bucket.

## Commands and recovery

```sh
npm run catalog:build    # resume existing SQLite state
npm run catalog:rebuild  # discard state and rebuild
npm run catalog:verify   # independently verify every shipped entry
```

The compiler writes `src/catalog/{easy,medium,hard,expert,extreme}.json` and `output/catalog-audit.json`. A stopped build can be resumed with `npm run catalog:build`; already evaluated grids are never regenerated or silently reclassified. Run `npm run catalog:audit` to refresh the checked audit directly from the shipped shards.
