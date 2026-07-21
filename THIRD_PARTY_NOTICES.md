# Third-party notices

Sudoku Pilot is licensed under the PolyForm Noncommercial License 1.0.0. The repository and deployed application also include third-party software and evaluation data under their own licenses.

## Deployed application

- **sudoku-gen 1.0.2**, by Pete Williams, supplies locally generated source puzzles. Licensed under the MIT License.
- **Vercel Web Analytics**, copyright Vercel, Inc., provides aggregate site analytics. Licensed under the MIT License.
- **PostHog JavaScript SDK 1.280.1**, copyright PostHog / Hiberly, Inc. and Mixpanel, Inc., provides anonymous product analytics. Licensed under Apache License 2.0.

The Apache License 2.0 and MIT license texts are available under `public/licenses/` and are included in production builds.

## OCR evaluation corpus

- **Libre Franklin** is used to create the synthetic printed evaluation boards. Copyright The Libre Franklin Project Authors; licensed under SIL Open Font License 1.1. The font and license are in `resources/ocr-evaluation/sources/` and `resources/ocr-evaluation/licenses/`.
- **Optical Recognition of Handwritten Digits**, created by E. Alpaydin and C. Kaynak and published by the UCI Machine Learning Repository, supplies handwritten digit samples. DOI: [10.24432/C50P49](https://doi.org/10.24432/C50P49). Licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Sudoku Pilot selects labeled samples for digits 1 through 9 and composes them into locally drawn Sudoku boards; those board compositions are modifications of the source data.

Exact corpus acquisition, modification, and verification details are documented in `resources/ocr-evaluation/README.md` and `resources/ocr-evaluation/manifest.json`.
