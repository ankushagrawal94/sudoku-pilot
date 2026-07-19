# Sudoku OCR evaluation corpus

This directory contains a small, durable evaluation corpus for board-level Sudoku OCR. It has **48 PNG boards**, each with an exact grid of printed/given digits. Every expected grid is explicitly in `manifest.json`; `0` means the cell is empty. There are no pencil notes or solution-only labels.

| Split | Cases | Image form | Ground truth |
| --- | ---: | --- | --- |
| `printed/` | 24 | print/book-like typeset Sudoku boards | exact 9x9 givens grid |
| `handwritten/` | 24 | Sudoku boards with handwritten digit samples | exact 9x9 givens grid and each digit's UCI class label |

## Legal provenance and constraints

### Printed split

* **Images and grids:** created locally by `scripts/build-ocr-evaluation-data.py`, not copied from a newspaper, book, puzzle app, or website. The deterministic grid generator creates valid Sudoku solutions and retains 28 to 37 givens per board.
* **Typeface:** Libre Franklin, downloaded from the Google Fonts `ofl/librefranklin` source path. The upstream `OFL.txt` is vendored at `licenses/OFL-1.1-Libre-Franklin.txt` and identifies **SIL Open Font License 1.1**. OFL permits use, embedding, redistribution, and sale when its conditions are retained.
* **Scope:** this is print-like, not a scan of a historic newspaper or book. No external editorial layout, title, branding, or puzzle content is present.

### Handwritten split

* **Digit source:** UCI Machine Learning Repository, *Optical Recognition of Handwritten Digits*, DOI [10.24432/C50P49](https://doi.org/10.24432/C50P49), original creators E. Alpaydin and C. Kaynak. The source archive is downloaded from `https://archive.ics.uci.edu/static/public/80/optical+recognition+of+handwritten+digits.zip`.
* **License:** UCI lists this dataset under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Citation and attribution are required on redistribution or publication. The UCI samples are 8x8 handwritten-digit images with exact class labels. This corpus only selects classes 1 through 9 and puts those labeled samples into locally drawn Sudoku boards.
* **Scope:** it tests handwritten **digit recognition in a Sudoku layout**, but not photographs of people completing paper Sudoku puzzles. It also does not test handwritten pencil notes.

## Exact acquisition and reproduction

The data and source artefacts are intentionally checked into the repository after building. To rebuild byte-identical output from a clean checkout:

```sh
python3 scripts/build-ocr-evaluation-data.py
python3 scripts/build-ocr-evaluation-data.py --verify-only
```

Requirements: Python 3.11+ and Pillow. The builder has fixed random seeds, downloads two pinned-by-URL source artefacts, records their SHA-256 values in `manifest.json`, and records a SHA-256 for each generated PNG.

`--verify-only` does not regenerate images. It validates the manifest image hashes. This makes accidental changes or incomplete checkouts fail clearly.

## Manifest contract

Each `cases[]` record has:

* `id`, `kind`, `image_path`, and `sha256`
* `expected_grid`: a 9-element list of 9 integers. `0` is empty; `1..9` are expected OCR values.
* `cell_labels`: documents that labels apply to givens only, and that notes are absent.
* `provenance`: human-readable origin per case.

Approaches being compared should produce the same 9x9 values. Count exact cell accuracy over all 81 cells, plus non-empty-cell accuracy over cells where `expected_grid != 0`; report both because background-cell handling can otherwise dominate the score.

## Important limitations

No legally clear, public dataset of full real newspaper/book Sudoku scans with matching 9x9 transcriptions was found during this research. Such scans commonly have publisher copyright and lack machine-readable labels. This repository therefore does **not** claim to provide those scans. The printed corpus is legally clean synthetic print-like material, and the handwritten corpus is a licensed, labeled digit dataset composed into boards. Add real photographed, scanned, or app-screen cases only after obtaining a source-specific permission/license and recording it in this manifest format.
