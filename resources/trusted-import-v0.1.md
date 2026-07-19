# Trusted Import Specification v0.1

## Status

Draft for product review and first-party corpus collection. This specification defines the first differentiated import milestone for Sudoku Pilot: resume a digitally solved Sudoku, preserve visible candidate notes, diagnose definite problems, and arrive at a trustworthy coaching state with little manual repair.

This is not a universal OCR promise. The first release is deliberately limited to clear digital screenshots and a review-first workflow.

## Product promise

> Bring the Sudoku you are already solving. Sudoku Pilot helps copy the visible state, calls attention to uncertainty and definite conflicts, and lets you verify the board before coaching begins.

Success is not merely producing an OCR result. Success means the learner can reach a trusted, editable state faster and with less effort than re-entering the board manually.

## Current baseline

The shipped application currently:

- Accepts an image and runs browser-local Tesseract on fixed cell crops.
- Attempts to recognize large, center-aligned values only.
- Places all recognized values in an editable 81-cell review grid.
- Lets a review cell contain one filled value or multiple candidate digits.
- Rejects visible row, column, and block duplicates before applying an import.
- Preserves the previous puzzle so an import can be reversed.
- Diagnoses candidate notes that are already illegal because of visible values.
- Keeps incomplete notes separate from definite note errors.

It does not currently:

- Reliably locate an arbitrary digital grid.
- Recognize candidate notes.
- Preserve whether a filled value was an original given or a player entry.
- Establish whether the imported values have zero, one, or multiple completions.
- Explain the confidence or provenance of each recognized cell.
- Require explicit full-board review before replacing the active puzzle.
- Measure correction burden or time to a trusted state on real app screenshots.

## Prior vision research decision

The unmerged `spike/sudoku-vision-pipeline` at research head `0d76bbd` is research evidence, not production code. Its closeout and Phase 7 reports are `output/sudoku-vision-ocr-closeout-v0.1.md` and `output/sudoku-vision-phase7-decision-v0.1.md` on that commit. The browser port passed generated geometry, model, worker, cancellation, review, and accessibility tests, but materially regressed on real images. Board detection was the first major divergence:

| Dataset | Python board found | Browser board found |
| --- | ---: | ---: |
| Lexski test | 0.890 | 0.400 |
| Wicht test | 0.950 | 0.600 |

The browser port also reached only 0.642 all-cell candidate-set exactness and 0.230 complete-board exactness on the Lexski test. The spike explicitly concluded that it should not be merged or deployed.

Trusted Import v0.1 therefore:

1. Does not merge the spike wholesale.
2. Treats its reports and fixtures as negative evidence and reusable research only.
3. Bypasses the known board-detection weakness with user-confirmed grid alignment before attempting candidate recognition.
4. Requires first-party screenshots representing the exact supported claim.
5. Keeps the shipped value-only OCR and manual grid available as fallbacks.

## Supported v0.1 scope

- Digital screenshots only.
- One visible, near-rectangular 9 by 9 Sudoku grid.
- Large displayed values.
- Conventional candidate notes whose position in a 3 by 3 mini-grid represents digits 1 through 9.
- A small, explicitly named set of source apps or sites selected from the first-party benchmark.
- Source themes and platforms that appear in the frozen benchmark and pass their individual floors.
- User-assisted crop or four-corner confirmation.
- Editable review before import.
- Local browser processing with same-origin assets.
- Manual entry and the current value-only OCR as durable fallbacks.

## Explicit non-goals

- Handwriting or pencil marks.
- Photographed paper, books, newspapers, glare, folds, or perspective-heavy scenes.
- Arbitrary, free-position, superscript, or nonstandard candidate layouts.
- Multiple grids in one image.
- Claiming support for every Sudoku app, theme, device, or layout.
- Automatically modifying the active puzzle after recognition.
- Uploading screenshots to an OCR service.
- Solver-based repair that silently changes recognized content.
- Guessing that a valid-looking entry is wrong when the evidence cannot prove it.
- Mastery tracking or adaptive skip-ahead; those remain a later initiative.

## Trusted-state model

Every review cell stores these concepts separately:

- `visibleValue`: the large digit currently visible, if any.
- `visibleCandidates`: the candidate digits visibly written in the cell.
- `valueRole`: `given`, `player`, or `unknown`.
- `recognitionSource`: manual, value OCR, candidate OCR, or imported structured data.
- `recognitionConfidence`: optional model confidence for emitted content.
- `reviewState`: needs attention, verify blank, or reviewed by the learner.
- `reviewReasons`: one or more concrete reasons for attention.

Solver candidates are not visible candidates. The solver may calculate possible digits for coaching, but it must not rewrite, fill, or treat missing player notes as contradictions.

## Import workflow

### 1. Select source

The learner selects a screenshot. The image appears without changing the active puzzle. The interface states that processing is local and that the learner will review the result before import.

### 2. Confirm grid

The interface proposes a crop or four corners. The learner can move the crop or corners before recognition.

Requirements:

- The adjusted grid remains visible over the screenshot.
- Corners are keyboard operable and have accessible coordinate labels.
- A reset action returns to the proposed geometry.
- Recognition cannot start with crossed, degenerate, or out-of-bounds corners.
- The confirmed grid is recorded in normalized image coordinates for evaluation.

### 3. Recognize visible state

Recognition may prefill values, conventional candidates, and value roles only when the selected source adapter has evidence for them. Unknown roles remain unknown.

Requirements:

- Work happens off the main thread when image processing is material.
- Cancellation discards late results and never changes the active puzzle.
- A failure preserves the selected image and existing review edits.
- The current value-only OCR and manual grid remain available.
- No solver result is used to alter the primary recognition output or its accuracy score.

### 4. Review cells

The editable grid is the trusted input, not the recognition result.

Requirements:

- One digit represents a filled value; multiple digits represent visible candidates.
- Predicted content remains directly editable.
- The interface distinguishes Needs attention, Verify blank, and Reviewed by you with text or iconography in addition to color.
- The learner can jump to the next high-priority cell.
- A cell label includes row, column, predicted content, role when known, and review reason.
- The screenshot and review grid can be compared without losing the current cell.
- Correcting a cell marks it reviewed. Every high-priority cell must be individually checked; the remaining cells can be covered by one explicit whole-board review confirmation rather than 81 mandatory clicks.

### 5. Diagnose the reviewed state

Diagnosis runs against the learner-reviewed state and reports evidence using the confidence levels below. Diagnosis never silently repairs the board.

### 6. Apply explicitly

Apply remains disabled until:

- every high-priority cell has been checked;
- the learner confirms that they visually reviewed all 81 cells;
- all definite blocking conflicts are resolved; and
- the learner explicitly confirms replacing the current puzzle.

Applying creates an undo/restore point, imports visible candidates exactly, and then opens the normal coaching path. Recognition, review, or diagnosis before Apply cannot mutate the active puzzle.

## Mistake-diagnosis contract

### Evidence levels

#### Definite error

Sudoku Pilot may use direct language only when the reviewed state proves the issue:

- A row, column, or block contains the same filled digit more than once.
- An empty cell has no legal digit under the reviewed filled values.
- A visible candidate is already excluded by a filled value in the same row, column, or block.
- A filled cell also contains visible candidate notes.
- A recognized value conflicts with a separately verified original-given solution.

#### Inconsistent board

If the reviewed filled values admit no completion, Sudoku Pilot may say that the board cannot be completed as entered. It may rank cells whose removal restores consistency, but those cells must be labeled **possible sources**, not confirmed mistakes.

When several minimal correction sets exist, show the ambiguity. Do not select one as fact.

#### Confirmed player-entry mistake

A player value may be called wrong only when all of the following are true:

1. Original givens are distinguishable with reviewed provenance.
2. The givens alone have exactly one solution.
3. The player value differs from that solution.

If value roles are unknown, this diagnosis is unavailable.

#### No contradiction found

If the reviewed state has at least one completion, Sudoku Pilot may say that no contradiction was found. It must not say every entry is correct. A wrong entry can still define a different valid partial puzzle when the original givens are unknown.

#### Multiple completions

If the reviewed original givens do not define one solution, Sudoku Pilot must not use a solution comparison to label player entries wrong. It may still report direct rule conflicts and definite note conflicts.

### Candidate-note rules

- A visible candidate contradicted by a filled peer is a definite note error.
- A missing candidate is not an error because the learner may use partial notation.
- A candidate that can be removed only by an unperformed advanced technique is not a note error.
- A candidate differing from the final solution digit is not inherently an error.
- Suggested repairs are previewed, individually selectable, and undoable.

## Source-support policy

A source app or site is supported only when its name, platform, theme, and layout appear in the frozen first-party test split and meet every per-source floor. A visual similarity to a supported source does not extend the claim to another app.

Source-specific adapters may provide:

- Expected grid bounds or chrome exclusions.
- Known 3 by 3 candidate positioning.
- Reviewed color or typography evidence for given-versus-player roles.
- Theme-specific segmentation parameters selected only from development and validation data.

Adapters must fail visibly to generic manual alignment. They must never apply a confident-looking parse from an unrecognized layout.

## First-party benchmark contract

The machine-readable intake contract lives in `resources/trusted-import-evaluation/`.

### Collection target

Select three initial source apps or sites based on actual learner use. For each source, collect at least 20 consented screenshots:

- At least 5 light-theme and 5 dark-theme cases when both themes exist.
- At least 5 candidate-bearing cases with sparse notes.
- At least 5 candidate-bearing cases with dense notes.
- At least 3 cases with at least one reviewed player mistake when role provenance is available.
- At least 3 late-game boards and 3 early-game boards.
- More than one supported viewport or device class.

The same underlying screenshot may not cross splits through crops, resizing, theme transforms, or other derivatives.

### Splits

- `development`: implementation and debugging; 10 cases per source.
- `validation`: threshold and adapter selection; 5 cases per source.
- `test`: untouched final evaluation; 5 cases per source.

Freeze image hashes, labels, and split membership before the test run. Do not tune against test failures.

### Ground truth

Every case records:

- Exact 81-cell visible values.
- Exact visible candidate set for every cell.
- Given, player, or unknown role for every visible value.
- Human-confirmed normalized grid corners.
- Source app/site, version when known, platform, device class, theme, and screenshot scope.
- Consent/provenance and a sanitized image hash.
- Reviewer identity and independent second-review status.
- Original givens and solution only when independently established.

Two people should verify frozen test labels. Disagreements are resolved before evaluation rather than scored as model errors.

## Evaluation metrics

Report aggregate results and separate results for every claimed source, theme, platform, note-density band, and split.

### Raw recognition

- Board-alignment acceptance rate.
- Exact visible-value accuracy on non-empty value cells.
- Value precision, recall, and F1.
- Candidate-token precision, recall, and F1.
- Exact candidate set on candidate-bearing ground-truth cells.
- Exact candidate set on the union of expected or predicted candidate-bearing cells.
- Exact full visible state across all 81 cells.
- Given-versus-player role accuracy and coverage, when supported.
- Unflagged content-error rate.

Blank cells must not dominate candidate-set accuracy. Always report candidate-bearing and union denominators separately.

### Workflow usefulness

- Time from image selection to trusted Apply-ready state.
- Number of cells manually changed.
- Number of candidate tokens manually added or removed.
- Number of review interactions.
- Percentage of cases abandoned for manual entry.
- Percentage of high-priority review flags that correspond to actual errors.
- Percentage of recognition errors not prioritized for review.

### Diagnosis

- Exact category match: definite conflict, inconsistent board, ambiguous suspect, confirmed player error, multiple completions, or no contradiction found.
- False definite-error count; this must be zero.
- Minimal suspect-set recall for inconsistent boards.
- Candidate-note error precision and recall using only direct visible constraints.
- Verification that incomplete notes are never labeled mistakes.

## Proposed v0.1 release gates

These thresholds are product targets, not claims about current capability. They may be revised only before the frozen test evaluation and with a recorded product decision.

### Safety gates

- Zero active-puzzle mutations before explicit Apply across automated and benchmark tests.
- Zero false definite-error diagnoses in the frozen test split.
- Zero imported states that differ from the fully reviewed grid.
- 100% of unresolved direct rule conflicts block Apply.
- Manual entry and value-only OCR remain usable after candidate recognition failure or cancellation.

### Trust and effort gates

- 100% exact reviewed state before Apply.
- Median time to Apply-ready state no more than 90 seconds; p90 no more than 180 seconds.
- Median manually changed cells no more than 6; p90 no more than 15.
- Median review interaction count at least 50% lower than manually re-entering all visible tokens in a measured baseline.
- No claimed source/theme segment may have more than twice the aggregate median correction burden.

### Recognition floors

- Non-empty visible-value exact accuracy at least 0.95 overall and 0.90 for every claimed source/theme segment.
- Candidate-token precision at least 0.95 overall and 0.90 per claimed source.
- Candidate-token recall at least 0.85 overall and 0.75 per claimed source.
- Candidate-bearing-cell exact set rate at least 0.75 overall and 0.65 per claimed source.
- Full visible-state exact rate at least 0.50 overall.
- Unflagged content-error rate below 0.02 of non-empty value or candidate-bearing cells.

If these raw-recognition floors prove unrealistic on the validation split, the product decision is to narrow the supported sources or keep candidate recognition experimental—not silently weaken the frozen-test gate.

### Diagnosis gates

- 100% exact direct-conflict detection.
- Zero incomplete-note false positives.
- Zero confirmed-player-error claims without verified role provenance and a unique givens-only solution.
- Every zero-completion board is labeled inconsistent.
- Every ambiguous suspect result clearly states that it is not a confirmed mistake.

## Automated verification

The implementation workstream must add:

- Corpus manifest, image-hash, split-leakage, label-shape, and provenance verification.
- Unit tests for every diagnosis evidence level.
- Adversarial cases where an apparently wrong entry still admits a completion.
- Browser tests for crop/corner adjustment, cancellation, retry, fallback, review navigation, diagnosis, Apply gating, restore, keyboard use, screen-reader labels, and mobile layout.
- Worker lifecycle, asset-integrity, CSP, offline, and no-network-upload tests for any new recognition runtime.
- Measured benchmark reports with registered thresholds and immutable frozen-test inputs.
- A visual-review packet covering every claimed source/theme and every diagnosis state.

The standard repository suite remains required:

```sh
npm run build
npm test
npm run catalog:verify
```

## Milestone sequence

1. Select three source apps/sites and collect the first development screenshots.
2. Complete and validate ground-truth labels using the intake contract.
3. Measure manual-entry and current value-only-OCR baselines.
4. Prototype user-confirmed grid alignment without changing recognition.
5. Implement deterministic diagnosis independently of candidate OCR.
6. Evaluate selective reuse of the spike's post-alignment segmentation and recognizer components on development/validation only.
7. Add candidate recognition for sources that meet validation floors.
8. Freeze the test split and thresholds.
9. Run the untouched evaluation and generate the review packet.
10. Ship only the source/theme matrix that passes every safety, effort, recognition, and diagnosis gate.

## Autonomous execution boundaries

Codex may autonomously:

- Build corpus validation and evaluation tooling.
- Implement user-assisted grid alignment and review-state UX.
- Implement deterministic conflict, completion-count, and suspect-set diagnosis.
- Port isolated research components when their provenance is clear and validation evidence improves.
- Add tests, benchmarks, accessibility improvements, and visual-review artifacts.

Codex must stop for product review before:

- Naming the initial supported source apps without first-party examples.
- Changing frozen split membership or thresholds after test evaluation begins.
- Calling an ambiguous suspect a confirmed mistake.
- Uploading images or diagnostics to any service.
- Adding telemetry, a backend, paid OCR, or new data collection.
- Merging the research spike wholesale.
- Expanding to handwriting, photographed paper, or nonstandard candidate layouts.

## Open inputs

Implementation is intentionally gated on the following user-provided evidence:

1. The two or three source apps/sites used most often.
2. At least five initial screenshots per source, including visible candidate notes.
3. Confirmation that the screenshots may be retained in the private development corpus.
4. Ground-truth transcription or permission for Codex to prepare one for human verification.

Until those inputs exist, the correct next work is the diagnosis engine and review/alignment foundation—not a claim of candidate-note recognition quality.
