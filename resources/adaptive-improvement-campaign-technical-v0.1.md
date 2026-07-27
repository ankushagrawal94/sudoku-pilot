# Adaptive Improvement Campaign: Technical Design v0.1

**Status:** Draft technical specification

**Updated:** 2026-07-26

**Product requirements:** [Adaptive Improvement Campaign Product Requirements v0.2](adaptive-improvement-campaign-product-v0.2.md)

## Purpose

This document defines an implementation contract for a continuous, local-first adaptive Sudoku curriculum.

The system selects the next best learning activity for a learner, records why it was selected, updates a personal skill graph from assistance-aware evidence, and makes another recommendation immediately after completion.

The architecture must not encode a one-activity-per-day limit. Calendar dates are evidence and review inputs only.

## Existing components to reuse

The first implementation should compose the current product rather than replace it:

- `src/puzzles.js`: committed technique catalog and public technique names;
- `src/learning.js`: structured technique lessons;
- `src/practice.js`: certified find-pattern, complete-puzzle, and near-miss fixtures;
- `src/coaching.js`: progressive coaching contract;
- `src/puzzleCatalog.js`: required and excluded technique filtering;
- `src/solver.js`: legal candidates, move discovery, replay, and solution-safe actions;
- `src/difficulty.js`: technique-based solve paths and effort metadata;
- existing puzzle persistence and undo machinery in `src/app.js`; and
- local-first analytics boundaries in `src/analytics.js` and `src/browserAnalytics.js`.

The campaign is an orchestration layer over these systems. It must not create a second solver, lesson catalog, or technique taxonomy.

## Design principles

1. **Continuous, not daily-gated.** A completed activity may produce the next one immediately.
2. **Local-first.** Core selection, progression, storage, and coaching do not require a server.
3. **Version everything that affects a recommendation.** A recommendation must be reproducible and explainable.
4. **Certify before serving.** Never relax the novelty budget at runtime.
5. **Evidence, not completion.** Mastery is produced by an assistance-aware reducer.
6. **Immutable evidence.** Derive learner state from append-only events so policy changes can be replayed.
7. **One authoritative technique registry.** The campaign references stable technique IDs mapped to the committed catalog.
8. **No synchronous startup sweep.** Precompute or defer expensive selection work.
9. **Explicit user control.** Profile corrections and overrides are first-class events.
10. **Fail closed.** If data or certification is incompatible, offer a safe standard activity instead of making a personalized claim.

## Module boundaries

Add the following conceptual modules. Filenames are proposed and may change during implementation, but responsibilities should remain separate.

| Module | Responsibility |
| --- | --- |
| `src/campaign/techniqueGraph.js` | Versioned nodes, edges, prerequisites, and validation |
| `src/campaign/evidence.js` | Evidence event constructors and validation |
| `src/campaign/mastery.js` | Pure reducer from evidence to skill state |
| `src/campaign/activityIndex.js` | Query shipped certified puzzles and practice fixtures |
| `src/campaign/selector.js` | Eligibility, ranking, deterministic tie-breaking, and explanation |
| `src/campaign/session.js` | Activity lifecycle and transitions |
| `src/campaign/storage.js` | IndexedDB schema, migrations, export, reset, and delete |
| `src/campaign/focusedSolve.js` | Learner-approved mastered-technique automation |
| `src/campaign/entitlement.js` | Local feature entitlement and future restore boundary |
| `src/campaign/analytics.js` | Privacy-reviewed campaign event projection |

UI composition belongs in the existing application shell. Domain modules must remain testable without the DOM.

## Versioned technique graph

### Stable identifiers

Technique names are reader-facing labels and may eventually change. Campaign records use stable IDs.

Example:

```js
{
  id: "w-wing",
  catalogName: "W-Wing",
  catalogVersion: 1,
  committed: true,
  tier: 2
}
```

The graph loader must assert that:

- every committed campaign node maps to exactly one committed coaching technique;
- every committed coaching technique maps to exactly one campaign node;
- no provisional technique is eligible;
- every edge references known nodes or registered visual-concept nodes;
- prerequisite edges are acyclic; and
- every non-foundational technique has a path from an eligible foundation.

Adding, removing, renaming, or promoting techniques remains a product-owner decision and requires a graph version change.

### Edge schema

```js
{
  from: "strong-link-recognition",
  to: "w-wing",
  type: "prerequisite",
  version: 1,
  rationale: "W-Wing requires recognizing a conjugate pair."
}
```

Supported types:

- `prerequisite`
- `family`
- `tool-support`
- `coverage-overlap`

Only `prerequisite` participates in the hard eligibility gate.

### Visual-concept nodes

The graph may include non-technique concepts such as:

- full candidate notation;
- bivalue-cell recognition;
- strong-link recognition;
- shared visibility; and
- base-line and cover-line recognition.

Concept nodes can be learned through lessons and observed tool use, but they are not promoted as standalone solving techniques. They must remain distinguishable from committed technique nodes in storage, analytics, and UI.

## Local data model

Use IndexedDB rather than a single local-storage blob. The campaign will accumulate append-only evidence and needs atomic, versioned updates.

### Database

Proposed database: `sudoku-pilot-campaign`

Initial schema version: `1`

### Object stores

#### `profiles`

One active local learner profile.

```js
{
  id: "local",
  schemaVersion: 1,
  createdAt,
  updatedAt,
  goal,
  preferredMinutes,
  preferredDifficulty,
  automationTechniqueIds,
  avoidedTechniqueIds,
  placementCompletedAt,
  masteryPolicyVersion,
  selectorPolicyVersion
}
```

#### `evidence_events`

Append-only evidence keyed by `eventId`, with indexes on `techniqueId`, `activityId`, and `occurredAt`.

```js
{
  eventId,
  profileId,
  activityId,
  techniqueId,
  eventType,
  assistanceLevel,
  puzzleStateFingerprint,
  canonicalPuzzleId,
  occurredAt,
  localDate,
  payloadVersion,
  payload
}
```

Do not store a full grid, candidate map, note set, or exact move in campaign evidence. Existing puzzle persistence remains authoritative for resumable gameplay.

#### `sudoku-pilot-solve-transcripts`

A separate IndexedDB database stores bounded, replayable solve runs for private detector validation. This database is not campaign evidence and is not part of account sync.

Each run stores:

- schema, codec, and analyzer versions;
- source, difficulty, and optional canonical/source IDs;
- an 81-digit initial-value encoding plus sparse initial solver eliminations;
- a compact ordered array of elapsed-time, action, value-patch, elimination-patch, technique-reference, and assistance fields;
- terminal status and completion time; and
- explicit `local-only` and `containsPuzzleContent` markers.

Retain at most 100 runs and delete completed runs older than 90 days. Persist one run record rather than one database row per move. Export and deletion are separate from the grid-free campaign export. Account sync receives only bounded technique aggregates derived on-device; raw transcripts never enter the account snapshot.

#### `skill_snapshots`

Materialized reducer output for fast reads.

```js
{
  profileId,
  techniqueId,
  graphVersion,
  masteryPolicyVersion,
  evidenceCursor,
  state,
  confidence,
  selfReport,
  distinctStateCount,
  distinctDateCount,
  unaidedSuccessCount,
  assistedSuccessCount,
  contradictionCount,
  lastExposureAt,
  lastUnaidedSuccessAt,
  reviewDueAt,
  updatedAt
}
```

Snapshots are disposable caches. Replaying evidence must reproduce them.

#### `activities`

Immutable activity assignments and lifecycle state.

```js
{
  activityId,
  profileId,
  activityType,
  focusTechniqueId,
  sourceKind,
  sourceId,
  canonicalPuzzleId,
  createdAt,
  startedAt,
  targetReachedAt,
  completedAt,
  replacedAt,
  abandonedAt,
  replacementActivityId,
  recommendationSnapshot,
  certificationSnapshot,
  lifecycleVersion
}
```

#### `campaign_state`

One small record containing:

```js
{
  profileId,
  currentActivityId,
  lastCompletedActivityId,
  campaignSequence,
  updatedAt
}
```

There is no `dailyAssignmentId` and no calendar-date uniqueness constraint.

#### `entitlements`

Stores only the minimum cached entitlement information needed for offline access. It must not contain payment credentials.

### Atomicity

Completing an activity must atomically:

1. append final evidence events;
2. update its lifecycle state;
3. advance `campaignSequence`;
4. clear `currentActivityId`; and
5. invalidate affected skill snapshots.

The next activity may be selected immediately in the same user flow, but selection should remain a separate transaction so a selector failure cannot lose completion evidence.

## Evidence event contract

### Event types

Initial event types:

- `placement_self_reported`
- `placement_check_started`
- `placement_check_completed`
- `activity_offered`
- `activity_started`
- `tool_used`
- `search_focus_revealed`
- `structural_location_revealed`
- `exact_move_revealed`
- `target_recognized`
- `focus_action_incorrect`
- `learner_reported_guess`
- `activity_completed`
- `activity_abandoned`
- `activity_replaced`
- `profile_corrected`
- `mastery_automation_enabled`
- `mastery_automation_disabled`

### Assistance levels

Use an ordered enum:

1. `none`
2. `tool`
3. `search-focus`
4. `structural-location`
5. `exact-move`

The campaign records the deepest assistance observed before target recognition. It must not infer assistance from UI visibility alone.

### State fingerprints

Distinct recognition evidence requires distinct logical puzzle states.

Create a privacy-preserving local fingerprint from:

- canonical puzzle ID or certified fixture ID;
- replay position;
- focus technique ID; and
- certification version.

The fingerprint is stored locally and is not sent to analytics.

## Mastery reducer

`reduceSkillState(events, policy)` must be pure and deterministic.

### Initial policy

The v1 policy may transition:

- `unseen` to `learning` after a lesson, first valid exposure, or an uncertain placement result;
- `unseen` to provisional `mastered` after self-report or successful placement;
- `learning` to `practicing` after a correct recognition;
- `practicing` to `mastered` after the product requirements' distinct-state, distinct-date, unaided-success, and contradiction rules;
- `mastered` to `review-due` after time-based staleness or contradictory evidence; and
- `review-due` to `mastered` after successful retrieval.

The exact thresholds live in a serializable policy object:

```js
{
  version: 1,
  masteryDistinctStates: 3,
  masteryDistinctDates: 3,
  masteryMinWithoutLocation: 2,
  reviewIntervalsDays: [7, 30],
  contradictionWindow: 5
}
```

These values are configurable policy, not constants distributed across UI code.

### Evidence weighting rules

- An exact-move reveal is exposure only.
- Completion has no direct mastery weight.
- Same-state repetitions do not increment distinct-state evidence.
- Multiple activities on one date can improve fluency counters but increment the distinct-date counter once.
- Self-report changes eligibility immediately but is marked provisional.
- Incorrect focus actions and explicit guesses reduce confidence conservatively; they do not erase earlier history.
- Replacement and abandonment influence activity choice and difficulty fit, not technique correctness by default.

### Recalculation

When mastery policy changes:

1. retain all valid evidence;
2. invalidate affected snapshots;
3. replay events under the new policy; and
4. record the new policy version in subsequent recommendations.

## Activity index

The selector needs a compact index rather than solving every puzzle at recommendation time.

### Indexed sources

- shipped catalog puzzles;
- certified complete-puzzle practice fixtures;
- certified find-pattern fixtures;
- certified near-miss fixtures; and
- lesson definitions.

### Puzzle index record

```js
{
  sourceId,
  sourceKind: "catalog" | "practice",
  canonicalPuzzleId,
  difficulty,
  solverVersion,
  certificationVersion,
  allowedTechniqueIds,
  requiredTechniqueIds,
  focusWindows: [
    {
      techniqueId,
      replayIndex,
      masteredStepsBefore,
      remainingSteps,
      actionFingerprint
    }
  ]
}
```

The checked runtime index should contain metadata and identifiers, not full research traces.

### Build-time certification

For each puzzle-focus pair:

1. verify a unique solution;
2. replay the taught path;
3. assert every action preserves the known solution;
4. assert the focus action exists at the recorded replay position;
5. assert the allowed technique set contains no second unmastered technique for the intended profile query;
6. record steps before focus, remaining steps, and switching metadata; and
7. reject incompatible solver or catalog versions.

The profile-specific novelty check still occurs at runtime because the mastered set differs by learner.

## Recommendation engine

### Entry point

```js
selectNextActivity({
  profile,
  skillGraph,
  history,
  activityIndex,
  researchPrior,
  now,
  policy
})
```

The function returns either:

```js
{
  activity,
  explanation,
  consideredCandidates,
  policyVersion,
  inputVersions
}
```

or a typed safe-fallback result.

### Pipeline

1. **Resume gate:** return the current incomplete activity unless the learner requests replacement.
2. **Skill projection:** load or recompute skill snapshots.
3. **Review gate:** identify due retrieval reviews.
4. **Technique eligibility:** apply committed-catalog, prerequisite, mastery, avoidance, and availability gates.
5. **Activity generation:** create viable lesson, drill, focused-puzzle, full-puzzle, and review candidates.
6. **Novelty certification:** require a taught path within the learner's mastered set plus focus.
7. **Scoring:** rank technique-activity pairs.
8. **Diversity and cooldown:** avoid recent canonical puzzles, over-repetition, and unnecessary same-family runs.
9. **Deterministic tie-break:** choose reproducibly from the profile and campaign sequence.
10. **Explanation:** save reason codes and render plain language.
11. **Persistence:** store the immutable activity and make it current.

The selector may run again immediately after completion. It must not check whether another activity was completed on the same date.

### Eligibility

Hard gates:

- committed focus technique;
- prerequisites ready;
- not mastered unless review due or explicitly requested;
- activity certification compatible;
- taught path within novelty budget;
- learner has not avoided the technique;
- time and difficulty fit; and
- no recent canonical duplicate.

### Scoring model

Use named, inspectable components rather than an opaque combined model:

```js
{
  coverageValue,
  masteryNeed,
  reviewUrgency,
  recognitionBurden,
  timeFit,
  goalFit,
  variety,
  activityQuality
}
```

The initial score may be a policy-defined weighted sum after normalization. Record component values and weights in the recommendation snapshot.

Do not train a predictive model in v0.1. First collect enough evidence to evaluate whether the heuristic produces meaningfully different and useful sequences.

### Research prior

The shipped prior should contain:

- artifact version;
- source study commit;
- candidate technique IDs;
- portfolio coverage by mastered-set mask;
- supported population choices;
- limitations text; and
- a checksum.

For the existing seven Tier 2 techniques:

1. encode the learner's mastered subset as a portfolio mask;
2. compute the incremental coverage of adding each eligible technique;
3. select the product-approved population or blended prior;
4. pass the delta as `coverageValue`; and
5. fall back to an explicitly versioned static prior when the learner's set is outside the study.

Never use trace frequency as a substitute. Never label the coverage delta "learning value."

### Determinism

Tie-breaking input:

```text
profileId | campaignSequence | selectorPolicyVersion | activityIndexVersion
```

Hash the input locally and choose among equal candidates. This makes selection reproducible without tying it to calendar date.

### Explanation contract

Store machine-readable reason codes:

- `PREREQUISITES_READY`
- `COVERAGE_VALUE`
- `RECENT_STRUGGLE`
- `MORE_EVIDENCE_NEEDED`
- `REVIEW_DUE`
- `TIME_FIT`
- `LEARNER_SELECTED`
- `SKIPPED_AS_MASTERED`
- `FALLBACK_NO_CERTIFIED_PUZZLE`

UI prose is generated from reason codes plus reviewed templates. The explanation must include limitations when research coverage is cited.

## Activity lifecycle

### States

```text
offered -> started -> target-reached -> completed
   |          |              |
replaced   abandoned      abandoned
```

An activity can be resumed from `started` or `target-reached`.

### Replacement

Replacement requires:

- a learner-selected reason;
- preservation of the original assignment and evidence;
- a link from the old activity to the replacement; and
- selector input that responds to the reason.

"Too hard" may choose a prerequisite, refresher, or easier activity. "Wrong focus" may retain difficulty but change the target.

### Completion and continuation

After completion:

1. persist final evidence;
2. show reflection and any skill-state change;
3. allow correction;
4. select the next activity; and
5. render "Continue campaign."

No network round trip or date rollover is required.

## Focused solve

Focused solve reuses the solver and existing automation behavior.

### Allowed automation

An action can be automated only when:

- its technique is in the learner's approved automation set;
- the current activity certification allows that technique;
- it is not the focus technique;
- the action is valid against current state;
- it preserves the solution; and
- no learner action has invalidated the certified replay assumptions.

### Batch behavior

- The learner explicitly starts the automation batch.
- Stop before the next focus-technique action or any unsupported decision.
- Show a summary grouped by technique.
- Store the batch as one undoable user action containing individual solver actions.
- Never hide a contradiction or silently repair player input.

### Failure

If replay diverges:

- stop automation;
- preserve the board;
- explain that the puzzle no longer matches the certified path;
- offer full solve or recovery; and
- do not record target failure.

## Placement implementation

Placement produces evidence rather than directly editing skill snapshots.

### Inputs

- assistance-aware evidence from the first certified puzzle activities;
- optional self-reported familiarity and goals;
- historical local lesson/practice/hint events that meet the new evidence contract;
- conservative defaults.

Legacy data without sufficient context may influence a recommendation explanation but must not be converted into false unaided-recognition evidence.

### Adaptive placement

Use prerequisite and family structure to reduce checks:

- offer a puzzle-first path that launches a fresh, complete Sudoku from the learner-selected certified difficulty without requiring questionnaire answers;
- offer a knowledge-first path whose technique controls are pre-filled from existing technique-aware campaign evidence and remain learner-correctable;
- infer a low-confidence initial goal and technique state from correct application, errors, guesses, and deepest assistance;
- successful recognition can skip nearby foundational checks provisionally;
- failure narrows the next check to prerequisites;
- learners may stop placement at any point; and
- the graph remains editable afterward.

The placement and goal-inference policies must be deterministic, separately versioned, visible as provisional, and capped to a product-approved maximum duration. A learner-provided goal overrides the inferred goal without rewriting prior evidence.

The opening full Sudoku is a diagnostic activity, not a personalized teaching puzzle. Its certification snapshot records the learner-selected difficulty ceiling and every committed technique allowed by the catalog record. It may sample several techniques, so it does not claim a one-new-technique budget. Completion alone is exposure; only assistance-aware, unambiguously attributed techniques affect the skill graph. Every subsequent personalized puzzle recommendation still enforces the one-new-technique budget without exception.

Technique perception may be pre-filled only from evidence that satisfies the campaign evidence contract. Aggregate puzzle-completion totals and legacy history without technique attribution remain visible as insufficient context, not converted into mastery. A future signed-in source can populate the same skill model only after the separately specified account-sync and provenance work is implemented.

For prospective play, evaluate a manual fill against every committed detector allowed by the current puzzle's certification. Attribute the move only when exactly one detector yields the same cell and digit. Record the conclusion and assistance separately from the replay transcript. Device-level technique aggregates may pre-fill **Learning**, but cannot pre-fill durable **Know it** because aggregate counters lack distinct-state and distinct-date provenance.

## Offline behavior

The production bundle or service-worker cache must include:

- technique graph;
- mastery and selector policies;
- activity index;
- research-prior artifact;
- lessons and certified practice fixtures;
- current shipped catalog; and
- reviewed explanation templates.

The current activity and campaign state live in IndexedDB.

Network absence must not block:

- placement after assets are cached;
- selecting the next activity;
- learning and practice;
- focused solve;
- evidence updates;
- campaign continuation; or
- export and deletion.

Do not put campaign selection on the screenshot OCR or any paid provider path.

## Optional sync boundary

Sync is outside v0.1, but local contracts should not make it impossible.

Future sync should operate on:

- append-only evidence events;
- immutable activities;
- profile preference revisions; and
- entitlement records.

Derived skill snapshots should not be synchronized as authority.

Conflict strategy should:

- merge unique evidence by event ID;
- preserve competing profile revisions for explicit resolution;
- avoid duplicating activity completion;
- re-run mastery after merge; and
- select a new recommendation only after the merged state is stable.

No sync provider should be chosen in this specification.

## Entitlement boundary

Campaign logic accepts a capability object:

```js
{
  adaptivePlacement,
  continuousRecommendations,
  skillGraph,
  focusedSolve,
  adaptiveReview,
  history
}
```

This keeps packaging out of selector logic.

During the free validation phase, all capabilities may be enabled. A later paid pilot can change capability resolution without changing stored learning evidence.

Offline entitlement requirements:

- cache only signed or otherwise verifiable non-secret entitlement state;
- retain access to downloaded local functionality for an approved grace period;
- never store payment credentials;
- fail to the free product without deleting campaign data; and
- restore access without forcing sign-in for ordinary free gameplay.

Lifetime scope and sync entitlement remain product decisions.

## Analytics projection

Campaign analytics receive a privacy-safe projection, never raw domain records.

Allowed fields may include:

- event name;
- activity type;
- focus technique ID;
- prior and resulting learning state;
- assistance level;
- selector reason codes;
- selector and graph versions;
- campaign sequence bucket;
- elapsed-time bucket;
- replacement reason;
- offline status; and
- entitlement tier.

Forbidden fields:

- puzzle grids or fingerprints;
- exact moves;
- cell indices;
- candidate sets;
- notes;
- screenshots;
- solution traces;
- local learner profile identifiers; and
- purchase or contact identifiers.

Add automated tests that inspect representative analytics payloads for forbidden keys and 81-character grid-like values.

## Performance requirements

The campaign must not recreate the previous synchronous generation bottleneck at startup.

- Render the existing shell and persisted current activity before computing a new recommendation.
- Target warm selection under 50 ms on a typical desktop and under 100 ms on the supported mobile baseline.
- Move selection work off the critical startup path.
- Use the precomputed activity index rather than solving the full catalog.
- If selection exceeds 50 ms, yield or run in a worker.
- Lazy-recompute mastery snapshots by affected technique.
- Cap placement and recommendation candidate counts deterministically.

Performance measurements must distinguish:

- database open and migration;
- evidence replay;
- candidate filtering;
- scoring;
- explanation rendering; and
- activity persistence.

## Failure and fallback behavior

Typed failure reasons:

- `INCOMPATIBLE_DATA_VERSION`
- `NO_ELIGIBLE_TECHNIQUE`
- `NO_CERTIFIED_ACTIVITY`
- `CORRUPT_SKILL_SNAPSHOT`
- `EVIDENCE_REPLAY_FAILED`
- `STORAGE_UNAVAILABLE`
- `ENTITLEMENT_UNAVAILABLE`

Required behavior:

- rebuild disposable snapshots when possible;
- never discard evidence automatically;
- preserve the current puzzle;
- distinguish personalized from non-personalized fallbacks;
- allow export before destructive reset;
- log only privacy-safe diagnostics; and
- keep free gameplay available.

If IndexedDB is unavailable, the campaign may run in a clearly labeled temporary session, but it must not promise durable progress.

## Testing strategy

### Unit tests

- graph completeness, mapping, and acyclic prerequisites;
- evidence validation;
- mastery transition tables;
- policy replay determinism;
- technique and activity eligibility;
- novelty-budget enforcement;
- score component normalization;
- deterministic tie-breaking;
- explanation reason coverage;
- replacement response; and
- entitlement capability resolution.

### Selector scenario tests

At minimum:

1. cold-start learner who begins without profile answers;
2. learner whose observed unaided Tier 1 application changes the next recommendation;
3. experienced learner who optionally self-reports Tier 1 mastery;
4. learner with W-Wing prerequisites but no Tier 2 mastery;
5. learner struggling repeatedly with a focus technique;
6. mastered learner returning after 30 days;
7. learner with five minutes available;
8. no certified full puzzle available;
9. learner avoiding the top research-ranked technique; and
10. two profiles that must produce different first-five sequences.

### Certification tests

- unique solution;
- target availability;
- exact replay;
- solution preservation;
- allowed technique set;
- focus-technique presence;
- no second unmastered technique;
- first-focus distance;
- canonical repeat handling; and
- solver/catalog version compatibility.

Do not run the expensive full catalog verifier for ordinary campaign code unless catalog generation changes `src/catalog/`. Build a focused activity-index verifier.

### Storage and migration tests

- clean database creation;
- atomic completion transaction;
- interrupted next-selection recovery;
- snapshot invalidation and replay;
- schema migration;
- corrupt snapshot recovery;
- export and import round trip;
- reset and delete;
- quota failure; and
- temporary-session fallback.

### Browser tests

Cover desktop Chromium and Pixel 5:

- placement and skip-ahead;
- campaign home explanation;
- continue immediately after completion;
- reload and offline resume;
- focused-solve summary and undo;
- replacement flows;
- skill-graph correction;
- assistance-depth evidence;
- review-due activity;
- export, reset, and deletion;
- compact solve-transcript replay, retention, separate export, and deletion;
- entitlement loss without data loss; and
- accessibility at 320 px.

### Privacy tests

- analytics payload allowlist;
- forbidden key and value detection;
- no puzzle data in selector diagnostics;
- export contains only documented campaign data; and
- raw solve transcripts remain local-only and never appear in campaign or account exports; and
- deletion removes campaign stores without affecting unrelated preferences unless requested.

## Rollout and migrations

### Feature flags

Suggested flags:

- `campaign_foundation`
- `campaign_placement`
- `campaign_continuous_recommendations`
- `campaign_focused_solve`
- `campaign_adaptive_review`
- `campaign_paid_entitlement`

Flags default off until their data contracts and tests pass.

### Phase order

1. Ship storage, graph, evidence, reducer, and developer selector trace.
2. Enable internal placement and recommendation simulation without changing the UI.
3. Compare simulated paths for representative learner profiles.
4. Enable local campaign UI for private validation.
5. Add focused solve.
6. Add adaptive review.
7. Validate technique tools separately.
8. Add paid entitlement only after adaptive value is demonstrated.

### Legacy migration

Do not infer detailed mastery from existing aggregate solve counts.

Safe legacy inputs:

- explicit lesson viewed;
- certified practice activity with recoverable technique and assistance context;
- explicit technique preference; and
- user self-report during placement.

Anything else remains history for product analytics, not mastery evidence.

## Implementation work breakdown

### Foundation

- technique graph and stable IDs;
- IndexedDB wrapper and migrations;
- evidence schema;
- mastery reducer;
- activity index builder and validator;
- selector and explanation trace.

### Product loop

- placement;
- campaign home;
- activity launch and lifecycle;
- reflection and correction;
- immediate continuation;
- skill graph view.

### Optimization

- focused solve;
- spaced review;
- selector timing;
- tool fading;
- entitlement boundary.

Each workstream should remain independently testable. Do not combine payment, optional account, or sync implementation with the first local campaign milestone.

## Technical acceptance criteria

- No date-based uniqueness or usage gate exists in campaign storage or selection.
- Completing one activity can produce another immediately.
- Evidence replay deterministically reproduces skill snapshots.
- Every recommendation records graph, policy, index, research, and selector versions.
- Every personalized puzzle passes runtime novelty-budget checks against the learner profile.
- Every target action has build-time and runtime replay validation.
- Two representative profiles produce different first-five sequences for documented reasons.
- Focused solve stops before the target and is undoable as one batch.
- The campaign works offline from shipped data.
- The selector is outside the critical first-render path and meets its performance budget.
- Data export, reset, deletion, and corrupt-snapshot recovery pass.
- Analytics tests prove that puzzle contents are absent.
- Existing lessons, practice, coaching, standard puzzles, and OCR behavior remain unchanged unless explicitly integrated.

## Open technical decisions

1. Should the activity index be generated as one file or sharded by focus technique?
2. Which IndexedDB wrapper, if any, is justified by bundle size and migration needs?
3. What is the approved cold-start prerequisite graph?
4. Which existing analytics events can be safely upgraded into mastery evidence?
5. Should recommendation scoring run on the main thread with yielding or in a web worker?
6. Which population prior should be used when technique-value results differ after the first three Tier 2 techniques?
7. How should a learner-selected mixed puzzle affect technique evidence?
8. What grace period is appropriate for offline subscription entitlements?
9. What compact export format preserves provenance without puzzle contents?
10. What minimum adaptive-effect threshold must simulation meet before UI implementation begins?
