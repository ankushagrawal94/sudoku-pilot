---
name: publish-sudoku-article
description: Create, revise, validate, and publish Sudoku Pilot website articles from structured JSON content files. Use when Codex is asked to add an SEO article, update article copy or metadata, add product screenshots, change related links, publish article content, or verify a live Sudoku Pilot article in this repository.
---

# Publish Sudoku Article

Use the repo-owned article schema and renderer. Keep layout, metadata, navigation, structured data, sitemap generation, and responsive styling in the shared publishing system.

## Load the source of truth

1. Work from the Sudoku Pilot repository root in a task-specific worktree.
2. Read the repository's `AGENTS.md` for the canonical working rules.
3. Read `references/article-schema.md` before creating or changing an article.
4. Inspect `git status --short --branch`. Preserve unrelated changes.
5. Check current product behavior in the repo before making a feature claim.

## Create or revise an article

1. Add or edit one file under `content/articles/<slug>.json`.
2. Keep the file limited to article content and metadata.
3. Set `updated` to the publication date. Preserve the original `published` date during revisions.
4. Use short declarative sentences. Lead with the direct answer.
5. State evidence, boundaries, and product limitations in plain language.
6. Avoid contrastive constructions such as `not X, but Y` and `not just X`.
7. Keep personal names, usernames, and identifying details out of public content. Use `Admin` for the article byline.
8. Add two or three useful `related` article paths.
9. Add links as `link` blocks. Use root-relative paths for Sudoku Pilot pages.

## Remove generated prose patterns

Treat a clean grammar check as the starting point. Before publishing, revise every paragraph with these tests:

1. Give the page one user task. Put the answer in the title and intro.
2. Use headings that tell the reader what they can do or what the product actually does.
3. Keep details that come from the real app: control names, sequence, examples, limits, and failure cases.
4. Delete abstract synthesis such as `this creates a tighter loop`, `that gap shaped the product`, and `this small pause matters`.
5. Break repeated two-sentence claim-and-resolution paragraphs. Let paragraph length follow the idea.
6. Avoid slogans, metaphors, rhetorical setup, false universals, and polished closing summaries.
7. Use first person only for a real product decision or firsthand experience. Do not invent a personal anecdote.
8. Read the page aloud. Rewrite any sentence that sounds like product marketing or could appear unchanged on another app's website.

## Verify product claims

Trace each material claim to current code, tests, a stored evaluation, or live behavior. Tighten the wording when the evidence covers a narrower case.

For generated-puzzle guarantees, distinguish generated puzzles from imported puzzles. Treat a certified solution trace as proof that one complete logical path exists. Do not claim that every player-selected move order produces the same trace.

## Capture product images

Use the browser-control skill and the real app.

1. Reproduce the feature in the app.
2. Capture the smallest UI region that proves the claim.
3. Save intermediate captures outside `public/` so the development server does not reload mid-capture.
4. Crop to the relevant panel or board state.
5. Inspect the resulting file for blank strips, cut-off controls, stale content, and excessive height.
6. Use a new descriptive filename when replacing a published image so browser caches receive the update.
7. Add exact dimensions to `imageDimensions` in `scripts/build-content.mjs`.
8. Check the article at a mobile-width viewport before publishing.

Prefer real app screenshots. Use generated illustrations only when the article needs a teaching diagram that the app cannot show directly.

Images are optional. Remove an image when it repeats another article's screenshot, does not prove the nearby claim, or adds page length without helping the reader.

## Validate the article system

Run:

```bash
npm run build
npm run test:content
git diff --check
```

Run relevant product tests for every feature claim. Run `npm test` when shared UI, navigation, the renderer, or product behavior changed.

The content build must fail for invalid article fields, missing images, unknown related paths, unsafe markup, banned contrastive framing, or em dashes.

## Review the rendered page

Confirm:

- full article content exists in built HTML before JavaScript runs;
- title, description, canonical URL, dates, structured data, and sitemap entry match the article file;
- the image is complete and proportionate;
- mobile text and navigation remain readable;
- related links resolve;
- the page offers a useful next action.
- public HTML and assets contain no private name or username variants.

## Publish

Deploy only when the user asked to publish or the active request clearly includes publication.

```bash
npx vercel deploy --prod --yes
```

Verify the canonical domain after deployment. Check the article title, direct answer, image URL and dimensions, sitemap entry, HTTP status, and browser rendering. Report commit and push state separately from deployment state.

## Revise the shared system

Change `scripts/build-content.mjs` or `public/content.css` only when the schema or presentation must change for every article. Add article-specific copy, images, dates, and relationships to the article JSON file.
