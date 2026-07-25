# Daily Personalized Puzzles v0.1

**Status:** Draft product specification

**Updated:** 2026-07-25

**Working name:** Personalized Improvement Coach

## Product promise

Every day, Sudoku Pilot gives the learner one puzzle chosen to move one part of their Sudoku skill set forward.

The daily puzzle should:

- practice a technique the learner has not yet mastered;
- minimize time spent repeating techniques the learner already knows;
- introduce at most one unfamiliar technique;
- use research about puzzle-completion coverage to prioritize useful techniques, while respecting prerequisites and the learner's own evidence; and
- update a local-first personal skill graph that makes the next recommendation better.

The experience should feel like a small, achievable step, not a daily exam. Missing a day creates no debt.

## Why this belongs in Sudoku Pilot

Sudoku Pilot already has the main building blocks:

- a committed catalog of coached techniques;
- structured lessons and certified technique practice;
- progressive hints that reveal only as much as the learner requests;
- technique-based puzzle metadata;
- controls that automate familiar deductions; and
- a local-first, offline-friendly product model.

Daily personalization connects those pieces into a curriculum. It changes the primary question from "What do you want to practice?" to "What is the most useful next step for you today?"

## Goals

1. Give a learner one clear daily recommendation with a short explanation of why it was selected.
2. Keep each assignment inside a one-new-technique novelty budget.
3. Reduce routine work by offering to automate techniques the learner has demonstrated they know.
4. Build technique mastery from observed evidence over multiple days, not from one completion or a self-reported label alone.
5. Prioritize high-coverage techniques when the learner is ready for them, then improve the ranking with actual recognition, effort, and retention data.
6. Work without an account and remain usable offline after the app has loaded.
7. Give learners control over their profile, data, focus, and coaching depth.
8. Create a credible paid improvement product without weakening the existing free solver, lessons, practice modes, or standard coaching.

## Non-goals for v0.1

- Adding, removing, renaming, or promoting techniques. Only the current committed coaching catalog is eligible.
- Claiming that a computational coverage ranking is the fastest human learning order.
- Requiring an account to receive a daily puzzle.
- Cross-device sync, household plans, social leaderboards, streak pressure, or competitive scoring.
- Generating a new research corpus or rerunning the technique-value study in the browser.
- Inferring mastery from puzzle completion alone.
- Allowing an uncertified puzzle to violate the novelty budget because the catalog has no perfect match.
- Paywalling the existing puzzle, lesson, manual practice, or coaching capabilities.

## Core concepts

### Daily assignment

A daily assignment is an immutable record created for the learner's local calendar date. It contains:

- the assigned puzzle or certified practice fixture;
- one focus technique;
- the profile version and research-prior version used to select it;
- the techniques allowed on its certified completion path;
- the reason it was selected;
- the recommended coaching tool, if any; and
- the assignment's completion and learning evidence.

The assignment remains the same throughout the day, even if the learner's profile changes while solving it. A replacement creates a linked replacement record rather than silently changing the original assignment.

### Focus technique

The focus technique is the one technique the assignment is intended to teach or strengthen. It must be:

- in the committed coaching catalog;
- not confidently mastered, or due for a spaced review;
- compatible with the learner's prerequisites; and
- present in a certified completion path for the assignment.

### Novelty budget

An assignment can have no more than one focus technique that is new or currently being learned.

The certified path may otherwise use only:

- techniques the learner has mastered;
- foundational techniques the learner has explicitly chosen to automate; and
- the focus technique.

The guarantee applies to the completion path Sudoku Pilot teaches and validates. It does not claim that no alternate logical path could contain another named pattern.

### Personal skill graph

The skill graph is a versioned, local model of the learner's technique knowledge.

Each technique node records:

- technique ID and catalog version;
- learning state;
- mastery confidence;
- evidence counts by assistance level;
- recent correct and incorrect recognition;
- recent practice dates;
- completion and abandonment context;
- average time to reach the focus move;
- whether the learner manually marked it as familiar or unfamiliar; and
- whether a review is due.

Edges have explicit meanings:

- **prerequisite:** a skill or visual concept needed before the target should be introduced;
- **family:** related patterns that may transfer, such as fish or wing techniques;
- **tool support:** a board tool that can scaffold recognition; and
- **coverage overlap:** techniques that often unlock the same puzzles and may substitute for one another.

Only prerequisite edges gate eligibility. Family, tool-support, and overlap edges influence explanations and ranking but must not silently lock a technique.

## Initial learning states

| State | Meaning | Daily behavior |
| --- | --- | --- |
| Unseen | No reliable evidence yet | Eligible only when prerequisites are ready |
| Learning | Introduced but still needs substantial help | Prefer focused examples and early tool support |
| Practicing | Recognized correctly, but evidence is not yet durable | Space repeated examples across days |
| Mastered | Repeated, mostly unaided success across days | Automate by choice and minimize repetition |
| Review due | Previously mastered but stale or recently missed | Use a short retrieval assignment, not a full re-teach |
| Locked | A prerequisite is not ready | Explain the prerequisite path; do not assign yet |

A learner may manually mark a technique "I know this" or "I want more practice." "I know this" creates provisional mastery and should be confirmed through later, low-friction evidence rather than treated as permanent proof.

## Mastery evidence

Mastery must be based on repeated recognition, not simply reaching a solved grid.

The first implementation should distinguish these outcomes:

- correct target move without a hint;
- correct target move after using a search-space tool;
- correct target move after a search-focus clue;
- correct target move after the structural location is revealed;
- exact move revealed or applied;
- incorrect placement or elimination involving the focus pattern;
- assignment replaced as too easy, too hard, or wrong focus;
- puzzle abandoned before or after reaching the focus window; and
- puzzle completed.

An initial mastery rule may promote a technique after all of the following:

1. at least three correct recognitions on distinct puzzle states;
2. evidence from at least three local calendar dates;
3. at least two recognitions without a structural-location or exact-move reveal; and
4. no repeated recent contradiction that indicates the pattern is being misapplied.

These thresholds are an implementation starting point, not a validated learning model. They must be versioned and calibrated against retention and recognition results. An exact-move reveal counts as exposure, not mastery. Abandonment is context, not an automatic failure.

## Research-backed prioritization

### What the current evidence supports

Sudoku Pilot's technique-value study measures the incremental puzzle-completion coverage of the seven committed Tier 2 detectors for a solver that already has the fixed Tier 1 repertoire.

The study's strongest shared coverage portfolio begins:

1. W-Wing;
2. 2-String Kite; and
3. XY-Wing.

That sequence is the highest-coverage one-, two-, and three-technique portfolio in both external puzzle populations evaluated by the study. The result is a useful curriculum prior for a learner who is ready for those techniques.

It is not evidence that W-Wing is the easiest technique to learn, the fastest to recognize, or the best use of every learner's next hour. The study assumes perfect technique availability and does not measure human study time, retention, enjoyment, or recognition accuracy.

The initial implementation should use the latest versioned technique-value study as a research prior. The current source is `resources/technique-value-study-report-v0.8.md` on the parallel `codex/technique-value-analysis` work, commit `21ac673`. The product must not depend on that branch at runtime; implementation should consume a small, reviewed, versioned ranking artifact after the study is integrated into `main`.

### Ranking a learner's next technique

Selection happens in two stages.

First, apply hard eligibility gates:

1. the technique is committed and coached;
2. prerequisite nodes are ready;
3. the technique is not confidently mastered, unless review is due;
4. a certified assignment exists within the novelty budget; and
5. the learner has not asked to avoid it.

Then rank eligible techniques using:

- incremental completion coverage for the learner's current mastered portfolio;
- mastery need and recent errors;
- spaced-practice timing;
- observed recognition success;
- observed time and hint burden;
- the learner's chosen goals and difficulty preference; and
- variety, so one difficult skill does not crowd out all other progress.

When the versioned study contains every portfolio for the current Tier 2 set, use the incremental coverage of adding each eligible technique to the learner's mastered portfolio. Do not substitute raw trace frequency for completion value.

At launch, human learning burden is unknown. Treat it as neutral rather than inventing precision, and collect the evidence needed to estimate it. Once enough consented aggregate evidence exists, the ranking should optimize expected retained coverage per unit of learner effort rather than coverage alone.

Every assignment must show a plain-language reason such as:

> Today's focus is W-Wing. You are ready for its two building blocks, and it unlocks more hard puzzles than any other unlearned technique in our current study.

The explanation must name the evidence category and avoid universal claims.

## Daily puzzle selection

### Candidate requirements

A puzzle is eligible only if:

- it has a unique solution;
- its technique metadata and solution trace use the current solver/catalog version;
- the certified taught path completes using mastered techniques plus the one focus technique;
- the focus technique appears in at least one meaningful target window;
- the target action remains correct when replayed from the assigned state;
- the coach can avoid suggesting any other unmastered technique;
- it fits the learner's difficulty and time preferences; and
- it has not recently been served to the learner under the same canonical puzzle ID.

Whenever possible, choose a full puzzle with the first focus window early enough that the learner reaches the lesson objective before fatigue. Puzzle transformations may create visual variety but do not count as a new logical puzzle.

### Minimizing mastered-technique work

Before the puzzle starts, offer:

- **Focused solve:** automatically run selected mastered techniques until the next focus-relevant choice, with an undoable summary; or
- **Full solve:** let the learner play every step.

Focused solve should be the recommended mode once the learner has confirmed which routine deductions may be automated. It must never automate the focus technique or make an unrequested move without showing what will happen.

The selection system should also prefer puzzles with:

- fewer mastered-technique steps before the first focus window;
- multiple valid opportunities to recognize the focus technique;
- limited switching between technique families; and
- a completion path short enough for the learner's daily time preference.

### Safe fallback

If no full puzzle satisfies the novelty budget, do not loosen the budget.

Use this fallback order:

1. a certified complete-puzzle practice fixture for the focus technique;
2. a certified find-the-pattern or near-miss exercise;
3. a spaced review of a previously learned technique; or
4. a standard non-personalized puzzle clearly labeled as such.

The learner should never receive a puzzle advertised as personalized when the selector cannot explain and certify the match.

## Daily experience

### 1. Today's recommendation

The home screen shows:

- today's focus technique;
- a one-sentence reason for the selection;
- estimated focused-solve time;
- whether the day introduces a new skill or reviews one;
- the suggested recognition tool; and
- actions to start, review the technique first, or choose a different focus.

### 2. Optional refresher

For a new or fragile skill, offer a concise refresher using the existing lesson structure:

- what it is;
- how to recognize it;
- why it works;
- a worked example;
- a genuine near miss; and
- a direct transition into the daily puzzle.

The learner can skip this without penalty.

### 3. Focused solve

During the puzzle:

- mastered deductions may be automated only according to the learner's explicit settings;
- the focus technique is never automated;
- coaching uses the existing progression from technique, to search focus, to structural location, to exact explained move;
- the relevant technique-finding tool may be offered between search focus and structural location; and
- the learner can switch to the full solve, undo automated progress, or stop without losing the assignment.

### 4. Tool fading

Technique-finding tools are scaffolds, not permanent dependencies.

For a new skill:

1. explain and offer the relevant tool;
2. later prompt the learner to choose the tool;
3. later leave the tool available without prompting; and
4. test recognition without it.

Tool use must remain optional, reversible, keyboard accessible, usable at 320 px width, and understandable without color alone. Claims must come from the solver's legal-candidate state unless the interface clearly says it is displaying only player-entered notes.

### 5. Reflection and skill-graph update

After the target window or completion, show:

- what the learner recognized;
- the deepest assistance used;
- what changed in the technique's learning state;
- whether a short follow-up would be useful; and
- what the system is likely to recommend next, without promising tomorrow's exact puzzle.

Let the learner correct the interpretation with "I knew this," "I guessed," "too easy," "too hard," or "wrong focus."

## Local-first and account behavior

### Without an account

The complete daily selection loop, skill graph, puzzle assignment, and mastery update must work locally.

- Store the skill graph and daily assignments in a versioned local database.
- Generate or select the assignment on-device from shipped, certified data.
- Cache enough data for the current assignment and core coaching to work offline.
- Use the device's local calendar date for the daily boundary.
- Export and delete the skill graph from settings.
- Explain that clearing site data or changing devices loses unsynced history.

### With an optional account

An account may later add:

- encrypted or appropriately protected cross-device skill-graph sync;
- purchase restoration;
- recovery after local data loss; and
- continuity across installed devices.

Sign-in must remain optional for free gameplay and for creating a local skill graph. Before sync is implemented, define conflict resolution, consent, data minimization, export, deletion, and local-to-account migration in a separate account specification.

## Paid product hypothesis

The Personalized Improvement Coach may be sold for:

- **$1 per month**, or
- **$20 lifetime**.

The paid entitlement would include:

- the personalized daily recommendation;
- the personal skill graph and adaptive sequencing;
- focused-solve automation based on demonstrated mastery;
- technique-tool scaffolding and fading;
- learning history and review scheduling; and
- adaptive coaching for every committed technique Sudoku Pilot teaches.

Existing standard puzzles, lessons, manual technique practice, and non-personalized coaching remain free.

The price and packaging are hypotheses until a paid pilot shows that learners experience and understand the value. "Lifetime" must have a precise entitlement definition before sale. At minimum, it should cover local personalization for the committed technique catalog and future committed technique content that can run within the same low-cost local architecture. Do not implicitly promise uncapped future third-party services, cloud storage, or cross-device sync.

A payment launch requires:

- clear trial or preview behavior;
- purchase, restore, cancellation, and refund flows;
- an entitlement that continues to unlock downloaded/local functionality offline;
- terms that define subscription and lifetime access;
- tax and payment-provider review;
- a way to recover purchases without forcing an account into ordinary gameplay; and
- explicit cost gates for any server-side dependency.

## Privacy and analytics

Personalization data is learning data and should be treated as sensitive product data even when it does not contain a real name.

Default behavior:

- keep the full skill graph, puzzle state, notes, and move history on-device;
- never send grid values, pencil notes, screenshots, or exact move contents to product analytics;
- send only coarse, consented events needed to evaluate the feature;
- make analytics optional and non-blocking; and
- support export, reset, and deletion.

Useful aggregate events include:

- daily assignment offered, started, replaced, and completed;
- focus technique and learning state;
- assignment mode and certified selector reason;
- assistance depth reached;
- tool offered and voluntarily used;
- target recognized;
- mastery-state transition;
- days since last practice; and
- paid preview, purchase, cancellation, and restore outcomes.

Technique and learning-state properties are acceptable only under the existing analytics privacy contract. Do not attach the underlying cell, candidate, note, or move data.

## Success measures

### Learning quality

- unaided target-recognition rate by technique and prior learning state;
- retained recognition after 7 and 30 days;
- false-positive or incorrect-application rate;
- time to first focus window;
- assistance depth needed over repeated exposures; and
- mastered techniques that later return to review.

### Product value

- daily assignment start and completion rates;
- percentage of assignments replaced as too easy, too hard, or wrong focus;
- return rate after the first, seventh, and thirtieth assignment;
- usage of focused solve versus full solve;
- learner agreement with the selection reason;
- paid preview-to-purchase conversion; and
- subscription retention and refund rate.

### Guardrails

- zero assignments with more than one unmastered technique on the certified taught path;
- zero target actions that fail solver replay or solution-preservation checks;
- no regression in offline startup or standard free gameplay;
- no increase in invalid move application caused by automation;
- no required account for local personalization; and
- no analytics payload containing puzzle contents.

## Rollout plan

### Phase 0: Data contract and offline selector

- Define the versioned skill-node, edge, evidence, assignment, and entitlement schemas.
- Create the prerequisite graph for the committed catalog and review it technique by technique.
- Build a deterministic selector against certified local puzzle metadata.
- Add novelty-budget and solution-replay tests.
- Expose a developer-readable "why this puzzle" trace.

### Phase 1: Local personalized daily puzzle

- Ship the daily card, recommendation reason, replacement flow, and reflection.
- Support Focused solve and Full solve.
- Keep all personalization local and free during validation.
- Establish baseline recognition, effort, retention, and selector-mismatch rates.

### Phase 2: Skill graph and adaptive review

- Add learner-facing skill graph and state explanations.
- Enable spaced review, manual corrections, export, reset, and deletion.
- Use evidence over multiple days to update mastery.
- Validate that the selector reduces mastered-technique work without reducing completion or trust.

### Phase 3: Technique tools and scaffold fading

- Add only the technique-finding tools that pass their own learner and accessibility evaluation.
- Insert them into the coaching progression.
- Measure whether tool use improves later unaided recognition.

### Phase 4: Paid pilot

- Test the $1 monthly and $20 lifetime offers after the local experience demonstrates learning value.
- Keep free capabilities intact.
- Add purchase restoration and entitlement safeguards.
- Decide whether optional-account sync is justified by measured demand.

## Acceptance criteria for an implementation-ready v0.1

- The committed technique catalog has a reviewed, versioned prerequisite graph.
- Every served assignment has a saved selector reason and version provenance.
- Every personalized assignment passes unique-solution, novelty-budget, allowed-path, target-replay, and solution-preservation checks.
- The same local-date assignment is stable across reloads and works offline.
- A learner can replace a mismatch without the replacement being counted as failure.
- Focused solve never automates the target technique and every automated action is summarized and undoable.
- Mastery requires repeated evidence across days; exact-move reveal and completion alone cannot grant mastery.
- The skill graph can be inspected, corrected, exported, reset, and deleted.
- Analytics contain no puzzle contents.
- The free experience remains fully functional without an account or paid entitlement.
- Pricing is not presented as final until the entitlement, restore, refund, and lifetime scope are approved.

## Open decisions

1. Which visual concepts belong as prerequisite nodes versus tool-support edges?
2. What is the minimum useful daily time preference: 5, 10, and 20 minutes, or another set?
3. Should the first assignment be chosen from self-reported familiarity, a short placement check, or both?
4. How many recent canonical puzzles should be excluded before reuse?
5. When should a mastered skill become review due?
6. Should a replacement keep the original focus with a different puzzle, change the focus, or offer both?
7. Which technique-finding tool should be validated first?
8. What learning evidence is sufficient to replace the neutral human-burden prior?
9. Does lifetime access include optional cloud sync, or only local personalization and technique content?
10. What purchase-recovery mechanism preserves optional login while meeting payment-provider requirements?

## Dependencies and related backlog entries

- **Daily personalized puzzles:** this document is the detailed product specification.
- **Optional login:** account sync and purchase recovery must preserve the local-first, account-optional contract defined here.
- **Evaluate technique-finding tools and coaching toggles:** validated tools become temporary scaffolds in the daily coaching progression and must fade as recognition improves.
- **Technique-value analysis:** provides the versioned completion-coverage prior; human learning and retention data remain a separate required evidence class.
