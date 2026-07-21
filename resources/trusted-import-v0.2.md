# Trusted Import Specification v0.2

## Status

Implementation specification for Sudoku Pilot's optional online screenshot recognition. It supersedes the processing and capability assumptions in `trusted-import-v0.1.md`; v0.1 remains preserved as the record of the earlier browser-local research decision.

The product decision for v0.2 is to use the hosted Sudoku OCR API through RapidAPI rather than train or ship another recognition model. The recognition provider is a paid, quota-limited dependency operated by Sudoku Pilot. Learners are not charged for a scan.

## Product promise

> Bring a screenshot of the Sudoku you are already solving. Online recognition drafts the visible values and candidate notes, and you verify the editable grid before anything changes in your puzzle.

This is a review-first import aid, not a universal OCR guarantee. A successful provider response is still untrusted until the learner reviews and explicitly applies it.

## Supported scope

- One visible, near-rectangular 9 by 9 Sudoku grid in PNG, JPEG, or WebP form.
- Images no larger than the application proxy's 4 MB limit.
- Large displayed values.
- Conventional candidate notes, including a cell with one visible candidate.
- Screenshots, clear printed grids, and handwriting only to the extent demonstrated by measured results.
- Editable review and explicit Apply before the active puzzle changes.
- Manual review/import remains available without online recognition.

## Known limits

- The provider labels large digits as solved values but does not reliably distinguish an original given from a player-entered value.
- The documented API response does not include per-cell confidence.
- Unusual candidate placement, faint marks, decorative grids, variant constraints, glare, perspective, and background clutter can reduce accuracy.
- Availability depends on a third-party service and Sudoku Pilot's current request quota.
- The selected image is sent to Sudoku Pilot's server-side proxy, RapidAPI, and the Sudoku OCR provider. Provider retention and model-training practices are not publicly documented, so Sudoku Pilot must not claim immediate deletion or no training.

## Import workflow

### 1. Select and preview

The learner selects an image. Before recognition, the interface explains that:

- online recognition sends the selected image to a third-party OCR provider;
- the service costs Sudoku Pilot money and has limited availability;
- the learner is not charged;
- manual review is available without sending the image; and
- the result must be checked before import.

Selecting or previewing the image does not upload it. Upload begins only after the learner invokes online recognition.

### 2. Recognize online

The browser sends the raw image to the same-origin `/api/sudoku-ocr` proxy. The proxy validates method, declared size, actual size, MIME type, and file signature before it can spend provider quota. It then sends one multipart request to the provider.

Requirements:

- The RapidAPI key remains server-only and is never embedded in a `VITE_` variable or browser bundle.
- The provider client never retries implicitly.
- Cancellation aborts the browser request and discards late results.
- A failed or cancelled request preserves the selected image and any existing review edits.
- Quota exhaustion and temporary unavailability produce a specific manual-review fallback message.
- Responses use `Cache-Control: no-store`.

### 3. Preserve cell type

The provider's solved/unsolved distinction must remain explicit in the review model:

- `{ kind: "value", value: 5 }` is a large filled digit.
- `{ kind: "notes", notes: [5] }` is a singleton visible candidate, not a filled value.
- `{ kind: "notes", notes: [1, 4, 8] }` is a multi-candidate cell.
- `{ kind: "notes", notes: [] }` is blank.

Digit-count inference is forbidden because it converts singleton notes into filled values.

### 4. Review and apply

The editable 81-cell review grid is the trusted input. Recognition never mutates the active puzzle. Apply validates direct row, column, and block conflicts, creates a restore point, and imports the reviewed values and visible notes exactly.

The current review UI may use a typed cell model internally while presenting a compact numeric editor. Any editor interaction must preserve or deliberately change whether a single digit is a value or a note.

## Privacy and analytics

Ordinary gameplay data—puzzles, entries, notes, history, practice progress, and preferences—continues to live in browser storage. Online OCR is the explicit exception to local processing.

Application logs may contain only operational metadata:

- request identifier;
- timestamp and UTC billing month;
- image MIME type and byte count;
- provider status and duration; and
- quota limit, remaining count, and reset interval returned by RapidAPI.

Logs and product analytics must not contain the image, recognized grid, cell values, candidate digits, filename, API key, or provider response body. PostHog may receive aggregate workflow outcomes such as success/failure and counts of recognized value/note cells.

## Usage and cost controls

Every provider attempt emits exactly one structured `sudoku_ocr_provider_call` event with `provider_calls: 1` immediately before the external request. Count that event for application-originated usage; RapidAPI's subscription dashboard and response quota headers remain the billing source of truth.

The initial free plan has a hard request limit, which prevents request overage charges but can make recognition unavailable after exhaustion. Before moving to any plan with paid overages, Sudoku Pilot must add a durable cross-instance rate limit or authenticated entitlement. An in-memory serverless counter is not a sufficient billing control.

The browser must prevent accidental duplicate scans while a request is running and make rescanning the same selected file a deliberate action.

## Evaluation

The checked synthetic fixture in `resources/sudoku-ocr-api/` covers values, multi-candidate cells, and a singleton note. A confirmation-gated live smoke test may spend one provider request and is intentionally excluded from `npm test`.

Synthetic success does not justify a broad accuracy claim. Product claims require a consented, first-party benchmark containing the actual screenshots, apps, themes, note densities, handwriting, and image conditions named in the claim. Continue using the intake and split controls in `resources/trusted-import-evaluation/`.

Report at least:

- board-level success/failure;
- exact large-value cells;
- candidate-token precision and recall;
- exact candidate-bearing cells, including singleton notes;
- exact full visible state;
- number of manual cell corrections; and
- time from selection to reviewed Apply-ready state.

## Release gates

- Zero active-puzzle mutations before explicit Apply.
- Zero secrets in client bundles, logs, or tracked environment files.
- Exactly one countable usage event per provider attempt and no automatic retries.
- Invalid types, oversized images, and signature mismatches rejected before a provider call.
- A visible upload/cost/quota disclosure before recognition.
- Manual import remains usable offline and after provider failure, timeout, cancellation, or quota exhaustion.
- Values and candidate notes—including singleton notes—round-trip from API response through review and Apply.
- Default build and test commands never invoke the live provider.

## Deployment

Local development stores `RAPIDAPI_KEY` only in ignored `.env.local`. Vercel deployments store it as a Sensitive environment variable, scoped only to environments that should offer online OCR. Preview deployments should not receive the production key by default.

Deployment is incomplete until the key is configured in Vercel, the committed branch is merged to `origin/main`, and production runtime logs confirm the expected usage and response events without sensitive content.
