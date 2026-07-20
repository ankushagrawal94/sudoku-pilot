# Sudoku Pilot

[![License: PolyForm Noncommercial 1.0.0](.github/badges/polyform-noncommercial.svg)](LICENSE)

[Open Sudoku Pilot](https://sudokupilot.com)

Sudoku Pilot helps you learn the techniques behind a solve and spot them on the board yourself.

When you get stuck, the coach shows the logical moves available from the techniques you selected. You decide how much of the explanation to reveal, which techniques to practice, and which routine deductions to automate.

## What makes it different

- **See the reasoning, not just an answer.** Browse every logical move supported by your selected techniques, inspect the affected cells, and choose the move you want to make. Hints never silently change the board.
- **Reveal only the help you need.** Hints progress from the technique, to where to look, to the pattern's location, and finally to the exact move. “Why does this work?” is there when you want the deeper explanation.
- **Practice one technique at a time.** Each committed technique has a lesson plus three practice modes: find the pattern, complete the puzzle, and tell a real pattern from a near miss.
- **Skip deductions you have already mastered.** Automate selected techniques until the puzzle reaches a move worth your attention, or run one named technique at a time.

## Top features

- **Progressive coaching catalog.** Learn and practice 17 fully coached techniques: Last Digit; Naked and Hidden Singles; Pointing and Claiming Candidates; Hidden Pairs and Triples; Naked Pairs, Triples, and Quads; X-Wing; Swordfish; Skyscraper; 2-String Kite; XY-Wing; XYZ-Wing; and W-Wing. Hidden Quadruple, Jellyfish, Crane, Simple Colouring, and Empty Rectangle are also available as clearly labeled provisional detectors.
- **No guessing required.** Every generated puzzle has a unique solution and a verified logical path from start to finish. You will never need trial and error—sometimes called Bowman's Bingo—to complete one.
- **Every available next move.** Instead of choosing one hint for you, the coach lets you compare all the logical moves currently available from your selected techniques.
- **Hints that do not spoil the solve.** Reveal help gradually, from the technique and where to look through the exact move. Stop as soon as you have enough to continue on your own.
- **Practice for a specific technique.** Choose the pattern you want to learn instead of waiting for it to appear in a random puzzle. Practice finding it, using it in a complete solve, and distinguishing it from near misses.
- **Technique-based difficulty.** Puzzle ratings reflect the logical techniques and effort in Sudoku Pilot's verified solve path, not simply the number of given digits.
- **Automation for familiar techniques.** Let Sudoku Pilot handle deductions you already know until the puzzle reaches a move worth your attention, or run one named technique at a time.
- **Import a puzzle for review.** Start from a screenshot, correct the recognized digits in an editable grid, and then solve or ask the coach to review the board. OCR reads large filled digits; pencil notes still need to be entered manually.
- **Input that works the way you solve.** Choose cell-first or digit-first entry, use the on-screen number pad or keyboard, and add a note to several cells at once. Fill or clear all pencil notes, undo moves, and configure peer highlights, matching-digit highlights, the timer, and live mistake feedback.
- **Private and offline-friendly.** Your puzzle progress stays in your browser. The installable app works offline after loading, and imported screenshots are not uploaded to an OCR service.

Technique detection never repairs an imported puzzle or overwrites a player's decisions. The solver tracks logical candidates separately from player-entered notes, so partial notes cannot create false deductions.

## Local, installable, and offline-friendly

Sudoku Pilot is a static Vite app with no application backend. It can be installed as a PWA, its app shell works offline after loading, and the current puzzle, notes, undo history, and technique selections are stored locally in the browser.

Starting screenshot OCR may require connectivity to load its browser-local recognition assets. Manual puzzle entry and the installed solving experience do not depend on an OCR server.

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
