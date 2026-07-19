# Sudoku Pilot

[![License: PolyForm Noncommercial 1.0.0](.github/badges/polyform-noncommercial.svg)](LICENSE)

**Practice logic, not repetition.**

[Open Sudoku Pilot](https://sudokupilot.com)

Sudoku Pilot is a practice-first Sudoku coach. It is designed for the part of solving that is hardest to improve: recognizing which logical technique is available and knowing when to use it.

Most Sudoku apps either leave you alone with the grid or reveal one answer when you get stuck. Sudoku Pilot instead shows the logical structure of the current board. You can inspect every available next move, focus the coach on techniques you are learning, and automate routine deductions so more of your time goes toward pattern recognition.

## What makes it different

### See the reasoning, not just an answer

The coach finds all logical moves supported by the selected techniques and explains each one by name. You can browse the alternatives, inspect the affected cells, and decide which move to make. Hints remain optional and never silently change the board.

### Get help in stages

The hint flow first checks for contradictions and incomplete or incorrect pencil notes. Every committed coaching technique then follows the same four-stage sequence: technique, search focus, structural location, and exact explained move. Early clues do not reveal the later answer. The exact stage distinguishes evidence, relationships, eliminations, and placements on the board, with deeper reasoning behind “Why does this work?” A move can be applied only at the exact stage and remains undoable.

### Train a technique deliberately

Every committed technique has an original structured lesson and three deliberate-practice modes. Lessons introduce recurring words such as candidate, sees, strong link, pivot, and wing in a shared learner glossary. Default instructions use short, concrete steps; optional technical explanations remain collapsed. Find the pattern starts exactly where the technique is available. Complete the puzzle follows a uniquely solvable verified path that begins with the target move. Near-miss recognition alternates valid and invalid configurations, then names the check that holds or the exact pattern rule that breaks.

Practice uses 10 deterministic, solution-preserving Sudoku transformations per technique instead of waiting for runtime random generation. The same four-stage clue progression and visual grammar used by the coach also appear in lesson examples and practice review.

### Automate the repetitive work

Choose the techniques you already know and let Sudoku Pilot repeatedly apply them until the puzzle reaches a position that needs your attention. You can also run one named technique at a time. The goal is not to solve the puzzle for you; it is to spend less practice time performing deductions you have already mastered.

### Inspect patterns directly on the board

The solving workspace includes pencil notes, bulk note entry, related-cell highlighting, matching-digit highlighting, and selected-digit row and column counts. Board checks pause coaching when the current values contain a contradiction.

Input and feedback preferences are configurable. Players can choose cell-first or digit-first entry, turn peer and matching-digit highlights on or off, control automatic candidate removal, hide the timer, and decide whether solution mistakes appear during ordinary play.

## Progressive coaching catalog

The committed four-stage catalog is:

- Last Digit, Naked Single, and Hidden Single
- Pointing and Claiming Candidates
- Hidden Pair and Hidden Triple
- Naked Pair, Naked Triple, and Naked Quadruple
- X-Wing and Swordfish
- Skyscraper and 2-String Kite
- XY-Wing, XYZ-Wing, and W-Wing

Hidden Quadruple, Jellyfish, Crane, Simple Colouring, and Empty Rectangle remain available as provisional detectors. They are clearly labeled in the technique picker and are not included in the committed coaching catalog.

Technique detection is used for coaching and practice. It is not used to silently repair an imported puzzle or overwrite player decisions. Player-entered notes are presentation state, not proof that excluded digits are impossible; the solver maintains its logical candidate state separately so partial notes cannot create false deductions.

## Import a puzzle for review

You can import a screenshot and edit the recognized board before starting. OCR runs locally in the browser and is limited to large, center-aligned filled values. The editable review grid—not the OCR output—is the trusted input, and pencil notes must currently be entered or corrected manually.

Candidate-note recognition has been explored in an isolated research pipeline, but it is not shipped as a production capability. Images are not uploaded to an OCR service.

## Local, installable, and offline-friendly

Sudoku Pilot is a static Vite app with no application backend. It can be installed as a PWA, its app shell works offline after loading, and the current puzzle, notes, undo history, and technique selections are stored locally in the browser.

Starting screenshot OCR may require connectivity to load its browser-local recognition assets. Manual puzzle entry and the installed solving experience do not depend on an OCR server.

## Honest scope

- Lessons and all three practice modes cover exactly the 17 committed Tier 1 and Tier 2 techniques. Tier 3 detectors are not promoted into learning or certified practice.
- Learner-facing lesson and coaching checks reject unexplained solver terms, keep recognition steps scannable, and verify that placement clues focus on the digit actually placed.
- Complete-the-puzzle certification records a sound intended path beginning with the selected technique and finishing with committed techniques. It does not claim every alternative mathematical solve order must use the same technique name; equivalent detectors can sometimes describe the same deduction.
- Puzzle generation offers Easy through Extreme using Sudoku Pilot's own deterministic rating model. Every generated puzzle is checked for a unique solution and must be solved by the logical techniques allowed at its level.
- Easy and Medium are both singles-only puzzles, separated by logical effort. Hard requires locked candidates. Expert requires a naked or hidden subset. Extreme requires a supported fish, wing, colouring, Crane, or Empty Rectangle technique; it is never inferred merely because the simpler solver got stuck.
- Screenshot OCR assists with filled values only. It does not claim reliable handwriting or candidate-note support.
- Coaching is review-first: hints and imported values remain under the player's control.

Difficulty ratings record the deterministic solution trace, hardest technique, per-technique counts, and total logical steps. They describe the path taken by Sudoku Pilot's solver rather than claiming a universal rating shared by every Sudoku publisher.

The generation API also accepts iterable technique filters for future custom modes:

```js
generatePuzzle({
  difficulty: "extreme",
  requiredTechniques: new Set(["XY-Wing"]),
  excludedTechniques: ["Empty Rectangle"]
});
```

Every required technique is disablement-certified: the full supported solver completes the puzzle, while the same solver with that technique disabled cannot. Excluded-technique selection uses a certified complete path that does not use the excluded techniques. The generator reports clearly when the catalog cannot satisfy a requested combination.

## Run locally

```sh
npm install
npm run dev
```

Run `npm run build` to create a production build in `dist/`. Build and review output is generated locally and is not committed.

Verification commands:

```sh
npm run build
npm test
npm run test:solver
npm run test:coaching
npm run test:learning-practice
npm run test:functional
npm run catalog:verify
npm run review:coaching
npm run measure:learning-practice
npm run review:learning-practice
```

## Production puzzle catalog

The production catalog contains 100 canonically distinct, certified puzzles at each of Easy, Medium, Hard, Expert, and Extreme. Runtime selection starts with an unplayed canonical seed when possible, then applies a visual Sudoku transformation. Transformed copies retain the seed's canonical ID and do not count as new logical puzzles.

Catalog generation is an offline, resumable build. Its SQLite state and full solution traces live under `.catalog-build/` and are not shipped. Compact runtime shards live in `src/catalog/`; the checked audit report lives at `output/catalog-audit.json`.

```sh
# Resume until the 100-per-level catalog is compiled
npm run catalog:build

# Rebuild from a fresh SQLite state
npm run catalog:rebuild

# Independently re-rate and canonicalize all 500 shipped entries
npm run catalog:verify

# Refresh the checked audit from the shipped catalog
npm run catalog:audit
```

The pipeline, schema, quality gates, provenance policy, and recovery workflow are documented in [resources/catalog-pipeline.md](resources/catalog-pipeline.md).

## Publish an article

Each article lives in `content/articles/<slug>.json`. The file contains its copy, dates, image, caption, related links, sections, and content blocks.

`scripts/build-content.mjs` supplies the shared page layout, metadata, structured data, navigation, image dimensions, related articles, sitemap, and validation. `public/content.css` supplies the shared presentation.

Use the Codex skill in `skills/publish-sudoku-article` to create, verify, and publish an article. It is installed locally at `~/.codex/skills/publish-sudoku-article`. Run `npm run build` and `npm run test:content` after every content change.

The product rationale and original requirements are documented in [resources/PRD.md](resources/PRD.md). The review-first screenshot and mistake-diagnosis milestone is specified in [resources/trusted-import-v0.1.md](resources/trusted-import-v0.1.md), with its first-party corpus contract in [resources/trusted-import-evaluation/README.md](resources/trusted-import-evaluation/README.md). Reference material lives in `resources/`. Generated reviews and measurements are written to the ignored `output/` directory; the certified catalog audit is the only tracked output artifact.

## License

Sudoku Pilot's source is available under the [PolyForm Noncommercial License 1.0.0](LICENSE). You may use, modify, and redistribute it for permitted noncommercial purposes. Commercial use is not licensed; contact `hello@sudokupilot.com` to discuss separate commercial terms. Because this license restricts commercial use, this project is source-available rather than open source under the Open Source Definition. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for redistributed software, font, and dataset attribution.

The Sudoku Pilot name, logo, visual identity, and other branding are reserved. The software license does not grant permission to use them for a fork, derivative product, or service, or to imply endorsement or affiliation. See the [brand policy](TRADEMARKS.md).

<details>
<summary>Project history</summary>

- **v0.21:** Rewrote all 17 lessons and practice prompts around a shared learner glossary, concrete four-stage clues, full row-and-column action labels, and rule-specific near-miss feedback.
- **v0.20:** Added structured lessons and deterministic three-mode practice for all 17 committed techniques, with reliability metrics and desktop/mobile review artifacts.
- **v0.19:** Added shared four-stage coaching definitions, exact relationship visuals, deterministic Tier 1/2 correctness fixtures, and desktop/mobile review artifacts.
- **v0.18:** Renamed the product to Sudoku Pilot and moved canonical site metadata to `sudokupilot.com`.
- **v0.17:** Hardened offline app-shell caching and deterministic build verification.
- **v0.16:** Renamed the product to Sudoku Method; added selected-digit line counts, progressive Hidden Pair clues, and About/feedback surfaces.
- **v0.15:** Improved multi-cell pencil-note entry and board-conflict guidance.
- **v0.14:** Corrected Hidden Pair and Hidden Triple hint formatting and filtering.
- **v0.13:** Normalized Notes, Multi, and More control states.
- **v0.12:** Made tapping the selected cell clear its selection and highlights.
- **v0.11:** Added recovery actions for empty hint states.
- **v0.10:** Made hints toggleable and easier to bring into view.
- **v0.9:** Improved regular-cell and 3x3-box grid contrast.
- **v0.8:** Added multi-cell selection for bulk pencil marks.
- **v0.7:** Made difficulty selection immediately start a fresh puzzle with progress protection.
- **v0.6:** Added installable/offline PWA support and local game persistence.
- **v0.5:** Introduced the board-first navigation, contradiction checks, and Extreme-generation guard.
- **v0.4:** Refined the mobile-first workflow, technique shortcuts, per-technique runs, and generated puzzles.
- **v0.3:** Corrected elimination hints when candidates existed only implicitly.
- **v0.2:** Fixed the selected-technique runner and added desktop/mobile functional coverage.
- **v0.1:** Shipped the first coach with board entry, notes, hints, technique filters, practice mode, and screenshot review.

</details>
