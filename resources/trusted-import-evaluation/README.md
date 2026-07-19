# Trusted import evaluation corpus

This directory defines the intake contract for the first-party digital-screenshot corpus required by `resources/trusted-import-v0.1.md`. It does not yet contain real source-app screenshots. That absence is intentional: app support and accuracy claims must come from consented examples, not synthetic or unrelated OCR data.

## Files

- `manifest.schema.json`: machine-readable JSON Schema for a corpus manifest.
- `manifest.template.json`: the honest empty collecting-state manifest to copy when collection begins.
- `manifest.example.json`: one fully labeled illustrative record. Its image path and hash are placeholders and it is not evaluation evidence.
- `scripts/validate-trusted-import-corpus.mjs`: semantic validator for labels, splits, roles, candidates, provenance, and frozen image hashes.

## Collection workflow

1. Select the first source app or site based on actual use.
2. Copy `manifest.template.json` to `manifest.json`.
3. Obtain explicit permission to retain each screenshot for private product development and evaluation.
4. Sanitize unrelated personal information without altering the Sudoku grid. Crop away notifications, account names, ads with personal targeting, and other unrelated screen content.
5. Store the PNG under `resources/trusted-import-evaluation/images/` using a non-personal case ID.
6. Add a case record. Use `manifest.example.json` only as a shape example.
7. Transcribe the exact visible values and candidate notes. Do not fill logically possible candidates that are not visible.
8. Mark each visible value as original given (`G`), player entry (`P`), or unknown (`U`). Use `.` for empty cells.
9. Have a second person verify labels before moving a case into the frozen test split.
10. Validate the corpus:

```sh
node scripts/validate-trusted-import-corpus.mjs resources/trusted-import-evaluation/manifest.json
```

While a corpus is in `collecting` status, missing images are errors unless `--allow-missing-images` is supplied for structure-only review. A `frozen` corpus always verifies every image hash and cannot be empty.

## Compact board encoding

- `values` is exactly 81 characters in row-major order. `0` means no large visible value.
- `candidates` is an array of 81 sorted strings. `"148"` means the screenshot visibly shows candidates 1, 4, and 8 in that cell. `""` means no visible notes.
- `value_roles` is exactly 81 characters. `G`, `P`, and `U` apply to visible values; `.` applies to cells without a large value.
- `solution`, when present, is exactly 81 digits from 1 through 9. Do not infer or include it unless the original givens are independently established.
- `grid_corners` are normalized image coordinates in top-left, top-right, bottom-right, bottom-left order.

Visible candidates and solver candidates are different data. Partial notes are valid ground truth.

## Split discipline

The target is 20 screenshots per claimed source: 10 development, 5 validation, and 5 untouched test cases. Derived crops, resizes, or theme transformations of the same screenshot stay in the same split. Test labels, image hashes, and split membership are frozen before final evaluation.

The legacy `resources/ocr-evaluation/` corpus is useful for large-digit regression tests, but it contains no real digital app screenshots or candidate notes and cannot satisfy this contract. The unmerged vision spike is also not a substitute for first-party evidence.
