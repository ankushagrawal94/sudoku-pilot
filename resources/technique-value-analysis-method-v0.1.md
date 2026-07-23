# Tier 2 technique value analysis method

## Decision

This analysis supports one decision: which committed Tier 2 Sudoku technique should a player learn first to complete more puzzles in Sudoku Pilot's shipped catalog?

The primary audience is a player who already knows every committed Tier 1 technique. The measured outcome is puzzle completion. Study time, spotting difficulty, and enjoyment are outside the score.

## Source inventory

| Source | Role |
| --- | --- |
| `src/catalog/*.json` | All 500 shipped canonical puzzles, 100 at each difficulty |
| `src/puzzles.js` | Tier 1, Tier 2, committed, provisional, and full technique profiles |
| `src/difficulty.js` | Configurable logical solve and disablement behavior |
| `src/solver.js` | Move detection, move application, and alternate-policy sensitivity checks |
| `resources/catalog-pipeline.md` | Catalog selection and certification definitions |
| `output/catalog-audit.json` | Shipped catalog coverage and required-technique metadata |

The experiment output is `output/technique-value-analysis-v0.1.json`. The companion notebook is `analysis/technique-value-analysis-v0.1.ipynb`.

## Experiment steps

1. Load all 500 shipped puzzles.
2. Solve each puzzle with the ten committed Tier 1 techniques.
3. Evaluate all 128 subsets of the seven committed Tier 2 techniques on top of Tier 1.
4. Measure the incremental coverage of each Tier 2 technique by itself.
5. Measure committed leave-one-out loss with all 17 committed techniques enabled except the focal technique.
6. Measure broad leave-one-out loss with all 22 supported techniques enabled except the focal technique. The five provisional detectors can act as fallbacks in this profile.
7. Calculate a Shapley contribution from the 128 portfolio coverage values.
8. Build a greedy coverage sequence. At each step, add the technique that completes the most additional puzzles.
9. Rerun the decision-relevant profiles with advanced-first and maximum-immediate-action move selection.
10. Reconcile the current solver against the catalog's stored solutions, step counts, technique sets, and required-technique labels.

Tier 1 solves 400 puzzles and fails on all 100 Extreme puzzles. Every Tier 2 portfolio is a superset of Tier 1. The implementation reuses the 400 solved baseline results and re-solves only the 100 baseline failures. This pruning preserves coverage counts because every added move is a sound logical deduction.

## Metric definitions

### Solo incremental unlocks

For technique `t`:

`coverage(Tier 1 + t) - coverage(Tier 1)`

This answers which single Tier 2 technique completes the most additional puzzles.

### Leave-one-out loss

For profile `P` and technique `t`:

`coverage(P) - coverage(P without t)`

The committed profile measures necessity among the 17 fully coached techniques. The all-supported profile measures necessity when provisional fallbacks remain available.

### Shapley marginal puzzles

For each Tier 2 technique, calculate its marginal coverage for every Tier 2 subset that excludes it. Weight each subset by its number of equivalent learning orders. The seven contributions sum to the 84 puzzles unlocked by the full committed Tier 2 set.

### Trace frequency

Trace frequency counts puzzles whose stored deterministic solution path uses the technique. It describes how often a pattern appears on one certified path. It does not establish necessity.

## Results snapshot

| Technique | Solo unlocks | Shapley contribution | Committed LOO loss | All-supported LOO loss | Stored Extreme traces |
| --- | ---: | ---: | ---: | ---: | ---: |
| W-Wing | 26 | 48.360 | 50 | 50 | 50 |
| X-Wing | 0 | 9.560 | 13 | 3 | 58 |
| XY-Wing | 10 | 8.976 | 3 | 3 | 69 |
| Skyscraper | 0 | 7.210 | 6 | 0 | 82 |
| 2-String Kite | 0 | 5.893 | 0 | 0 | 83 |
| XYZ-Wing | 0 | 2.193 | 3 | 3 | 22 |
| Swordfish | 0 | 1.810 | 1 | 1 | 31 |

The greedy sequence is W-Wing, 2-String Kite, X-Wing, Skyscraper, XY-Wing, XYZ-Wing, and Swordfish. Cumulative Extreme coverage is 26, 61, 74, 77, 80, 83, and 84.

## Validation results

The source contains 500 unique puzzle IDs and 500 unique grids. Every grid and solution has the expected shape. Fresh solves produced:

- zero level-profile failures;
- zero step-count mismatches;
- zero technique-set mismatches;
- zero solution mismatches;
- zero required-technique mismatches.

W-Wing ranks first for solo incremental coverage under the standard, advanced-first, and maximum-immediate-action policies. Its committed leave-one-out loss remains 50 under all three policies. The maximum-immediate-action policy changes XY-Wing's committed loss from three to six. It does not change the first-choice recommendation.

## Limitations

The result is decision-ready for the current Sudoku Pilot catalog with visible caveats.

- The catalog is selected for technique coverage, gate diversity, and other quality features. It does not estimate the natural prevalence of techniques in an uncurated puzzle population.
- The 100 Extreme puzzles contain two exact solution templates, 50 puzzles each. This concentration limits external generalization.
- The solver follows deterministic or explicitly named move policies. The analysis does not prove necessity across every mathematically possible logical move order.
- The score values completion only. It does not include learning time, visual complexity, technique prerequisites, or solve speed.
- Provisional detectors are treated as available fallbacks only in the all-supported leave-one-out profile.

The highest-value follow-up is to run the same script on an independently sourced, deduplicated corpus with different construction rules. A later study can add estimated study time and create a benefit-per-hour ranking.

## Visualization contract

The technical report uses one ranked bar chart. It compares Shapley marginal puzzle coverage across the seven Tier 2 techniques. The source dataset also retains solo unlocks, both leave-one-out losses, trace frequency, required frequency, rank, and the 100-puzzle denominator for audit and chart switching.

The exact leave-one-out metrics and greedy sequence remain tables because row lookup and cumulative values matter more than shape. The notebook adds a grouped horizontal chart that compares solo unlocks with both leave-one-out profiles.

## Reproduction

Run the experiment from the task worktree:

```sh
npm run analyze:techniques
```

Execute the notebook after creating a Python environment with `nbformat`, `nbclient`, `ipykernel`, `pandas`, and `matplotlib`:

```sh
jupyter execute --inplace analysis/technique-value-analysis-v0.1.ipynb
```

Run the lightweight artifact consistency test:

```sh
npm run test:technique-analysis
```

## Changelog

- v0.1, 2026-07-21: Added the 128-portfolio experiment, two leave-one-out profiles, Shapley contributions, move-policy sensitivity, catalog reconciliation, and initial recommendation.
