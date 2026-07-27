# Adaptive Improvement Campaign: Product Requirements v0.2

**Status:** Draft product requirements

**Updated:** 2026-07-26

**Working product name:** Personalized Improvement Coach

## Product decision

Sudoku Pilot should build an adaptive improvement campaign, not a once-per-day puzzle feature.

The campaign continuously recommends the next best learning activity for the individual learner. "Today's personalized puzzle" remains a useful home-screen entry point and habit cue, but it never limits the learner to one activity per day. After completing an activity, the learner can continue immediately.

The product must earn its differentiation from a conventional Sudoku campaign by:

- identifying and skipping techniques the learner already knows;
- changing the sequence based on demonstrated skill, errors, retention, goals, and available time;
- minimizing routine work inside each puzzle;
- introducing no more than one unfamiliar technique at a time;
- using versioned completion-coverage research as one input to prioritization;
- fading assistance as recognition improves; and
- returning mastered skills for review only when evidence says it is useful.

If the experience follows substantially the same sequence for every learner, requires learners to replay material they have already mastered, or merely unlocks chapters in order, it has not met this product requirement.

## Product promise

> Sudoku Pilot finds the next best puzzle for your personal skill graph, skips what you already know, and keeps adapting until every technique it teaches is durable.

Each recommended activity should push the learner a small, explainable step forward. The campaign should feel efficient and responsive, not like a syllabus the learner must grind through.

## Competitive boundary

An authored campaign can already teach techniques one after another with lessons and appropriate puzzles. Breadth, a chapter map, and unlimited progression are therefore baseline expectations rather than differentiation.

Sudoku Pilot's wedge is adaptive efficiency:

| Conventional campaign | Sudoku Pilot adaptive campaign |
| --- | --- |
| One authored order | A learner-specific next-technique order |
| Chapter completion | Evidence of recognition and retention |
| Replay prior material | Skip or automate demonstrated mastery |
| Same practice dose | Practice amount changes with performance |
| Forward-only progression | Spaced review when evidence becomes stale |
| Generic explanation of sequence | A saved, learner-readable reason for every recommendation |
| Technique lessons as the product | A personal skill graph that coordinates lessons, practice, puzzles, tools, and review |

The campaign should not attempt to win initially on technique count. It should make the current committed catalog feel substantially more personal and time-efficient.

## Goals

1. Recommend one clear next activity and explain why it is the best next step for this learner.
2. Let the learner continue through as many recommended activities as they want.
3. Keep every learning activity within a one-new-technique novelty budget.
4. Reduce time spent on mastered techniques through puzzle choice and explicit, undoable automation.
5. Infer mastery from repeated recognition across different puzzle states and days.
6. Adapt the sequence when the learner advances quickly, struggles, returns after time away, or corrects the system.
7. Use completion-coverage research without misrepresenting it as human learning-efficiency evidence.
8. Work locally without an account and remain useful offline.
9. Preserve learner control over focus, pacing, automation, data, and coaching depth.
10. Create a paid improvement product whose value is visible before purchase.

## Non-goals for v0.2

- Restricting learners to one personalized puzzle per calendar day.
- Using streak loss, missed-day debt, energy, lives, or other artificial pacing gates.
- Adding, removing, renaming, or promoting techniques. Only the current committed coaching catalog is eligible.
- Recreating a large, fixed chapter campaign.
- Claiming the computational technique ranking is the fastest human teaching order.
- Requiring an account for local campaign progression.
- Cross-device sync, household plans, leaderboards, competitive scoring, or social features.
- Inferring mastery from completion, solve speed, or self-report alone.
- Paywalling existing standard puzzles, lessons, manual practice, or non-personalized coaching.
- Violating the novelty budget when no suitable full puzzle is available.

## Learners and jobs

### Developing learner

> Help me learn techniques in an order that is challenging but not overwhelming.

### Experienced but uneven learner

> Let me skip techniques I already know and find the gaps that prevent me from solving harder puzzles.

### Returning learner

> Remind me only of the skills that have become rusty, then continue from where I am.

### Time-constrained learner

> Give me the highest-value activity that fits the time I have right now.

### Self-directed learner

> Recommend a path, but let me inspect, correct, or override it without fighting the product.

## Experience principles

### Continue, do not wait

The campaign always has a next recommended activity when an eligible one exists.

- The home screen may feature "Today's personalized puzzle."
- Completing it reveals "Continue campaign" or a more specific next action.
- The learner can complete several activities in one sitting.
- Calendar time affects spaced review and retention evidence, not access.
- Leaving mid-activity preserves the current recommendation for later.

### One unfamiliar technique at a time

Every taught path can use:

- techniques the learner has mastered;
- foundational techniques the learner has chosen to automate; and
- one focus technique that is new, being learned, or due for review.

The guarantee applies to the path Sudoku Pilot certifies and teaches. It does not claim that every possible logical path contains only those techniques.

### Explain the recommendation

Every recommendation includes a plain-language reason grounded in one or more of:

- prerequisite readiness;
- a demonstrated gap or recent error;
- research-backed incremental completion coverage;
- review timing;
- the learner's selected goal;
- the learner's available time; or
- a need for another example before mastery.

Examples:

> You recognized Hidden Pairs without help in three different puzzles, so we are skipping more pair practice.

> W-Wing is ready next: you know its building blocks, and it adds the most completion coverage among your currently eligible Tier 2 techniques in our study.

> You learned X-Wing last month but needed the full location clue today, so this short review comes before a new technique.

The interface must not imply greater certainty than the evidence supports.

### Respect corrections

The learner can say:

- I already know this;
- I want more practice;
- too easy;
- too hard;
- wrong focus;
- I guessed; or
- choose a different technique.

Corrections update future recommendations. They do not count automatically as success or failure.

## Campaign model

### Campaign

The campaign is the learner's ongoing sequence of recommended learning activities. It has no fixed end date or daily quota.

When every committed technique is mastered, the campaign shifts to:

- lightweight retention reviews;
- learner-selected exploration;
- difficult mixed puzzles; and
- newly committed techniques when the catalog expands.

### Activity

An activity is one bounded learning unit. Supported activity types are:

1. **Placement check:** a short diagnostic used to avoid reteaching familiar techniques.
2. **Technique refresher:** the existing structured lesson or a concise subset of it.
3. **Find the pattern:** a certified state where the focus technique is ready.
4. **Near-miss recognition:** compare a valid pattern with a look-alike that breaks one rule.
5. **Focused puzzle:** a complete puzzle whose taught path includes the focus technique while minimizing mastered work.
6. **Full puzzle:** the same certified puzzle without automated mastered deductions.
7. **Retrieval review:** a short, delayed test of a previously mastered technique.

The selector chooses both the focus technique and the activity type.

### Current recommendation

The current recommendation is an immutable activity record generated from a snapshot of:

- the skill graph;
- learner preferences;
- the technique catalog;
- puzzle and fixture certification versions;
- the research prior;
- the selection-policy version; and
- recent campaign history.

It remains stable across reloads until the learner starts, completes, replaces, or dismisses it. Completing it may generate the next recommendation immediately.

### "Today's personalized puzzle"

"Today's personalized puzzle" is the home-screen label for the current recommended puzzle activity when one exists.

It is not:

- a unique calendar-date entitlement;
- the only personalized activity available that day;
- a requirement that every recommendation be a full puzzle; or
- a streak obligation.

If the current recommendation is a refresher, pattern exercise, or review, the home screen should name that activity honestly rather than calling it a puzzle.

## Personal skill graph

The skill graph is a versioned, local model of the learner's demonstrated Sudoku knowledge.

### Technique nodes

Each committed technique node records:

- learning state;
- mastery confidence;
- self-reported familiarity;
- evidence counts by assistance level;
- recent correct and incorrect recognition;
- distinct puzzle-state and calendar-date counts;
- last exposure, successful retrieval, and review dates;
- time to reach the focus move;
- automation preference;
- replacement and abandonment context; and
- catalog and mastery-policy versions.

### Edge types

- **Prerequisite:** a skill or visual concept required before the target is eligible.
- **Family:** a related pattern that may transfer.
- **Tool support:** a technique-finding tool that can scaffold recognition.
- **Coverage overlap:** a technique that often unlocks the same puzzles.

Only prerequisite edges block eligibility. Other edge types affect ranking, explanations, scaffolding, and review.

### Learning states

| State | Meaning | Campaign behavior |
| --- | --- | --- |
| Unseen | No reliable evidence | Eligible after prerequisites or placement evidence |
| Learning | Introduced and still needs substantial help | Prefer focused examples and explicit scaffolding |
| Practicing | Some correct recognition, not yet durable | Vary examples and space repetitions |
| Mastered | Repeated, mostly unaided recognition | Skip, automate by choice, and review sparingly |
| Review due | Mastery evidence is stale or contradicted | Offer a short retrieval activity |
| Locked | A prerequisite is not ready | Explain the path and recommend the prerequisite |

"I already know this" creates provisional mastery. The campaign should confirm it later with low-friction retrieval rather than immediately forcing a lesson or treating the report as permanent proof.

## Placement and onboarding

The campaign should not make an experienced learner begin at the first lesson.

Initial placement is observation-first and combines:

1. short certified puzzle activities that reveal which techniques the learner can apply and the deepest assistance used;
2. optional self-reported familiarity and goals;
3. existing local lesson, practice, hint, and solve history; and
4. conservative defaults when evidence is missing.

The learner can:

- begin immediately without specifying a goal, session preference, or technique knowledge;
- accept a recommended starting point;
- inspect the inferred skill graph;
- mark techniques familiar or unfamiliar; and
- stop placement and continue with the current provisional recommendation.

The campaign should infer an initial path from observed target recognition, technique application, errors, and assistance. Any inferred goal or successful placement result remains provisional, visible, and correctable. Self-report can accelerate placement but is never required and never becomes permanent proof.

## Mastery evidence

The campaign must distinguish:

- correct recognition without assistance;
- correct recognition after using a technique-finding tool;
- correct recognition after a search-focus clue;
- correct recognition after structural location is revealed;
- exact move revealed or applied;
- an incorrect action involving the focus pattern;
- a self-reported guess;
- replacement as too easy, too hard, or wrong focus;
- abandonment before or after the focus window; and
- puzzle completion.

An initial mastery policy may require:

1. at least three correct recognitions on distinct puzzle states;
2. evidence from at least three local calendar dates;
3. at least two recognitions without a structural-location or exact-move reveal; and
4. no repeated recent contradiction suggesting the pattern is being misapplied.

These thresholds are a versioned starting heuristic, not a validated learning model.

- Exact-move reveal counts as exposure, not mastery.
- Completion alone cannot grant mastery.
- Speed alone cannot grant or remove mastery.
- Abandonment is context, not automatic failure.
- Multiple activities in one sitting improve fluency evidence but do not replace delayed retention evidence.

## Recommendation policy

### Eligibility gates

A focus technique is eligible only when:

1. it is in the committed coaching catalog;
2. its prerequisites are ready;
3. it is not confidently mastered, unless review is due;
4. a certified activity exists within the novelty budget;
5. the learner has not asked to avoid it; and
6. its activity fits the learner's current time and difficulty preferences.

### Ranking signals

Rank eligible techniques and activities using:

- incremental completion coverage for the learner's mastered portfolio;
- mastery need and recent errors;
- prerequisite readiness;
- delayed-review urgency;
- observed recognition and hint burden;
- estimated activity time;
- learner goals and explicit focus choices;
- recent variety; and
- puzzle availability and quality.

The recommendation engine should adapt both the technique and the dose. One learner may need a lesson, two pattern exercises, and a focused puzzle; another may pass a placement check and skip directly to the next technique.

### Research prior

Sudoku Pilot's technique-value study measures completion coverage for the seven committed Tier 2 detectors on top of the fixed Tier 1 repertoire.

The strongest shared one-, two-, and three-technique completion portfolio begins:

1. W-Wing;
2. 2-String Kite; and
3. XY-Wing.

Use this as a versioned prior only when the learner's prerequisites are ready. The study does not measure learning time, recognition accuracy, retention, enjoyment, or human teaching order.

The current research source is `resources/technique-value-study-report-v0.8.md` on the parallel `codex/technique-value-analysis` work at commit `21ac673`. Runtime implementation must consume a small, reviewed, versioned ranking artifact after that work reaches `main`; it must not depend on another branch.

As campaign evidence accumulates, rank expected retained completion coverage per unit of learner effort rather than coverage alone. Until then, treat human burden as unknown instead of inventing precision.

## Puzzle and activity requirements

### Certified taught path

A focused or full puzzle is eligible only if:

- it has a unique solution;
- its metadata and trace use the current solver and catalog versions;
- the taught path completes using mastered techniques plus the focus technique;
- the focus technique appears in at least one meaningful target window;
- the target action remains correct when replayed;
- the coach can avoid suggesting another unmastered technique;
- it fits the learner's difficulty and time preferences; and
- its canonical puzzle ID is not inside the learner's recent-repeat window.

Puzzle transformations create visual variety but do not count as new logical puzzles.

### Minimize mastered work

Prefer puzzles with:

- fewer mastered steps before the first focus window;
- multiple valid opportunities to recognize the focus technique;
- limited switching among technique families;
- a short completion path for the learner's time preference; and
- no unnecessary repetition of recently confirmed mastery.

For eligible puzzle activities, offer:

- **Focused solve:** run learner-approved mastered techniques until a focus-relevant decision; or
- **Full solve:** let the learner play every step.

Focused solve is explicit, undoable, and summarized. It never automates the focus technique.

### Safe fallback

If no full puzzle satisfies the novelty budget, do not weaken the budget.

Use:

1. a certified complete-puzzle practice fixture;
2. a find-the-pattern or near-miss activity;
3. a retrieval review;
4. a learner-selected technique activity; or
5. a standard non-personalized puzzle clearly labeled as such.

The campaign must never present an uncertified match as personalized.

## Coaching and tool fading

The campaign reuses the existing coaching progression:

1. technique;
2. search focus;
3. structural location; and
4. exact explained move.

A relevant technique-finding tool may be offered between search focus and structural location.

Tool support fades as evidence improves:

1. explain and offer the tool;
2. prompt the learner to choose it;
3. leave it available without prompting; and
4. test recognition without it.

Tools must remain optional, reversible, keyboard accessible, usable at 320 px width, and understandable without color alone. Candidate claims must come from the solver's complete legal-candidate state unless the interface clearly labels player-note-only information.

## Campaign interface

### Campaign home

Show:

- current recommendation;
- activity type and focus technique;
- why it was selected;
- estimated time;
- whether it introduces, reinforces, or reviews a skill;
- suggested scaffold, if any;
- current campaign progress by learning state; and
- actions to start, inspect the lesson, choose another focus, or review the skill graph.

### During an activity

- Preserve the current recommendation and profile snapshot.
- Allow the learner to change coaching depth.
- Automate only explicitly approved mastered techniques.
- Never automate the focus technique.
- Allow stop, resume, replacement, and undo without corrupting evidence.

### Reflection

After the focus window or activity:

- show what was recognized;
- show the deepest assistance used;
- explain any skill-state change;
- ask for a correction when interpretation is uncertain;
- offer the next recommended activity immediately; and
- distinguish same-session fluency from delayed mastery evidence.

## Local-first and account behavior

### Without an account

The complete placement, campaign, skill graph, recommendation, activity, and mastery loop works locally.

- Store versioned campaign data in a local database.
- Select activities on-device from shipped, certified data.
- Cache the current activity and core coaching for offline use.
- Export, reset, and delete the skill graph and campaign history.
- Explain that clearing site data or changing devices loses unsynced history.

Local calendar dates are used only for evidence spacing and review timing.

### Optional account

An account may later add:

- protected cross-device skill-graph sync;
- purchase restoration;
- recovery after local data loss; and
- continuity across installed devices.

Sign-in remains optional for free gameplay and a local campaign. Before sync is implemented, define consent, data minimization, conflict resolution, export, deletion, and local-to-account migration separately.

## Paid product hypothesis

The Personalized Improvement Coach may be sold for:

- **$1 per month**, or
- **$20 lifetime**.

The paid entitlement may include:

- continuous adaptive recommendations;
- the personal skill graph;
- learner-specific placement and skip-ahead;
- adaptive sequencing and review;
- focused-solve automation;
- tool scaffolding and fading;
- campaign history; and
- adaptive coaching for every committed technique Sudoku Pilot teaches.

Existing standard puzzles, lessons, manual practice, and non-personalized coaching remain free.

The product must demonstrate adaptation before asking for payment. A paid pilot should let a learner see:

- what Sudoku Pilot inferred;
- what it skipped;
- why the next activity differs from a generic sequence; and
- how the recommendation changes after new evidence.

Pricing and packaging remain hypotheses. "Lifetime" must define whether it covers only low-cost local personalization and technique content or also future cloud services. Do not imply uncapped third-party services, storage, or sync.

## Privacy and analytics

Keep the full skill graph, puzzle state, notes, exact moves, and evidence history on-device by default.

Product analytics may record only coarse, consented events such as:

- placement started and completed;
- recommendation offered, accepted, replaced, or dismissed;
- activity type, focus technique, and prior learning state;
- selector reason category and policy version;
- assistance depth;
- tool offered and voluntarily used;
- target recognized;
- skill-state transition;
- campaign continuation;
- review interval; and
- paid preview, purchase, cancellation, refund, and restore outcomes.

Do not send grid values, pencil notes, screenshots, candidates, or exact move contents.

## Success measures

### Differentiation

- percentage of learners who skip at least one technique through placement;
- percentage whose first five activities differ from the default cold-start sequence;
- mastered steps avoided through puzzle selection or focused solve;
- recommendation corrections and whether the next recommendation responds;
- learner agreement that the campaign understands their level; and
- time saved relative to a fixed-sequence baseline.

### Learning

- unaided recognition by technique and prior state;
- retained recognition after 7 and 30 days;
- incorrect-application rate;
- assistance depth over repeated exposures;
- time to first focus window;
- activities required before mastery; and
- mastered skills later returned to review.

### Product

- placement completion;
- recommendation start and completion;
- same-session campaign continuation;
- return after the first, seventh, and thirtieth campaign day;
- activity replacement reasons;
- free preview to paid conversion;
- subscription retention; and
- refund rate.

### Guardrails

- zero certified paths containing more than one unmastered technique;
- zero target actions failing replay or solution-preservation checks;
- no account required for local progression;
- no calendar-based usage gate;
- no regression in offline startup or free gameplay;
- no invalid action caused by automation; and
- no analytics payload containing puzzle contents.

## Planned scope

### Phase 0: Technical foundation

- Define versioned technique graph, learner state, evidence, activity, selector, and entitlement contracts.
- Review prerequisites for all committed techniques.
- Build a deterministic local selector and developer-readable explanation trace.
- Create a certified activity index.
- Add novelty-budget, replay, and privacy tests.

### Phase 1: Placement and continuous local campaign

- Ship observation-first placement using certified puzzle activities, with self-report and goal selection as optional corrections.
- Show the skill graph and allow corrections.
- Generate a current recommendation without a daily quota.
- Offer the next recommendation immediately after completion.
- Support lessons, find-pattern, near-miss, focused-puzzle, and full-puzzle activities.
- Keep the campaign free and local during learning validation.

### Phase 2: Mastery, skip-ahead, and review

- Update skill states from assistance-aware evidence.
- Skip or automate demonstrated mastery.
- Add delayed review and return-from-absence behavior.
- Validate that different learners receive meaningfully different sequences.

### Phase 3: Tool scaffolding

- Validate technique-finding tools individually.
- Insert approved tools into coaching.
- Fade prompts as recognition improves.
- Measure later unaided recognition.

### Phase 4: Paid pilot

- Demonstrate the adaptive value before the offer.
- Test $1 monthly and $20 lifetime packages.
- Preserve free capabilities.
- Add entitlement, restore, cancellation, and refund safeguards.
- Decide whether optional-account sync is justified.

## Product acceptance criteria

- The feature is named and described as an adaptive campaign, not a daily quota.
- Learners can continue immediately after completing a recommendation.
- Learners can begin without declaring a goal or technique knowledge.
- The first activity is a fresh, complete Easy Sudoku that records technique application and deepest assistance before adapting the path.
- The opening diagnostic puzzle uses the certified Easy technique ceiling and does not claim a single new technique or grant mastery from completion.
- Initial placement can skip familiar techniques.
- At least two meaningfully different learner profiles produce different first-five activity sequences.
- Every recommendation stores and displays a reason.
- Every personalized learning puzzle passes novelty-budget and replay checks; the separately labeled opening diagnostic puzzle passes Easy-ceiling and replay checks.
- Mastered techniques are skipped or explicitly eligible for automation.
- Exact-move reveal and completion alone cannot grant mastery.
- Delayed evidence is required for durable mastery.
- Learners can inspect and correct the skill graph.
- Local progression works offline without an account.
- The skill graph and history can be exported, reset, and deleted.
- Existing free capabilities remain available.
- Pricing is not final until adaptive value and entitlement scope are validated.

## Open product decisions

1. How many observation-first placement puzzles reliably avoid reteaching familiar skills without creating onboarding fatigue?
2. What should the default cold-start prerequisite graph be?
3. Which activity types appear in the free adaptive preview?
4. What time choices should the campaign support?
5. How many same-session repetitions are useful before delayed review is required?
6. When does a mastered technique become review due?
7. How much recommendation override should be visible on the campaign home?
8. Which technique-finding tool should be validated first?
9. What evidence is sufficient to estimate retained coverage per unit of effort?
10. Does lifetime access include sync or only local personalization and technique content?

## Related documents and backlog

- Technical design: [Adaptive Improvement Campaign Technical Design v0.1](adaptive-improvement-campaign-technical-v0.1.md)
- Canonical backlog: [Sudoku Pilot TODO](todo.md)
- Optional login: must preserve the local-first campaign and define sync separately.
- Technique-finding tools: become temporary campaign scaffolds only after validation.
- Technique-value analysis: supplies a versioned completion-coverage prior, not a human learning-order guarantee.
