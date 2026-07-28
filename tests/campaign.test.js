import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import {
  ASSISTANCE_LEVELS,
  buildCampaignActivityIndex,
  CAMPAIGN_ACTIVITY_INDEX_VERSION,
  CAMPAIGN_INFERENCE_POLICY_VERSION,
  CAMPAIGN_OBSERVATION_POLICY_VERSION,
  CAMPAIGN_TECHNIQUE_GRAPH,
  createEvidenceEvent,
  createCampaignSession,
  createMemoryCampaignStorage,
  createObservationReplayToken,
  createPuzzleStateFingerprint,
  deepestAssistanceLevel,
  EMPTY_RESEARCH_PRIOR,
  formatSelectorTrace,
  prerequisitesReady,
  queryCampaignActivities,
  reduceSkillState,
  selectNextActivity,
  techniqueIdForName,
  uniquelyAttributeFill,
  validateCampaignActivityIndex,
  validateTechniqueGraph
} from "../src/campaign/index.js";
import { COMMITTED_COACHING_TECHNIQUES, PROVISIONAL_TECHNIQUES } from "../src/puzzles.js";

assert.equal(validateTechniqueGraph(), true);
const techniqueNodes = CAMPAIGN_TECHNIQUE_GRAPH.nodes.filter((node) => node.kind === "technique");
assert.equal(techniqueNodes.length, COMMITTED_COACHING_TECHNIQUES.length);
assert.deepEqual(techniqueNodes.map((node) => node.catalogName), COMMITTED_COACHING_TECHNIQUES);
for (const technique of PROVISIONAL_TECHNIQUES) {
  assert.equal(techniqueIdForName(technique), null, `${technique} must stay outside the campaign graph`);
}
assert.equal(prerequisitesReady("w-wing", masteredSkills([
  "claiming-candidates",
  "hidden-pair"
])), true);
assert.equal(prerequisitesReady("w-wing", masteredSkills(["claiming-candidates"])), false);
assert.equal(prerequisitesReady("w-wing", {
  "claiming-candidates": { techniqueId: "claiming-candidates", state: "review-due" },
  "hidden-pair": { techniqueId: "hidden-pair", state: "mastered" }
}), true, "review-due knowledge still satisfies downstream novelty prerequisites");

const fingerprint = createPuzzleStateFingerprint({
  sourceId: "fixture-1",
  replayIndex: 4,
  techniqueId: "w-wing",
  certificationVersion: 1
});
assert.match(fingerprint, /^state-v1-[0-9a-f]{8}$/);
assert.equal(fingerprint, createPuzzleStateFingerprint({
  sourceId: "fixture-1",
  replayIndex: 4,
  techniqueId: "w-wing",
  certificationVersion: 1
}));
assert.deepEqual(ASSISTANCE_LEVELS, ["none", "tool", "search-focus", "structural-location", "exact-move"]);
assert.equal(deepestAssistanceLevel(["none", "tool", "search-focus"]), "search-focus");
assert.equal(CAMPAIGN_OBSERVATION_POLICY_VERSION, 1);
const observationState = {
  values: Array(81).fill(0),
  eliminated: Array.from({ length: 81 }, () => new Set())
};
const observationToken = createObservationReplayToken(observationState);
assert.match(observationToken, /^logical-state-v1-[0-9a-f]{8}$/);
assert.equal(observationToken, createObservationReplayToken(structuredClone(observationState)));
const changedObservationState = structuredClone(observationState);
changedObservationState.eliminated[8].add(7);
assert.notEqual(observationToken, createObservationReplayToken(changedObservationState));
assert.equal(uniquelyAttributeFill({
  moves: [
    { technique: "Naked Single", fills: [{ index: 8, digit: 7 }] },
    { technique: "Hidden Single", fills: [{ index: 9, digit: 3 }] }
  ],
  allowedTechniqueNames: ["Naked Single", "Hidden Single"],
  index: 8,
  digit: 7
}), "Naked Single");
assert.equal(uniquelyAttributeFill({
  moves: [
    { technique: "Naked Single", fills: [{ index: 8, digit: 7 }] },
    { technique: "Hidden Single", fills: [{ index: 8, digit: 7 }] }
  ],
  allowedTechniqueNames: ["Naked Single", "Hidden Single"],
  index: 8,
  digit: 7
}), null, "ambiguous deductions must not be attributed");
assert.equal(uniquelyAttributeFill({
  moves: [{ technique: "Naked Single", fills: [{ index: 8, digit: 7 }] }],
  allowedTechniqueNames: ["Hidden Single"],
  index: 8,
  digit: 7
}), null, "detectors outside the source certification must not be attributed");
assert.throws(() => event({
  eventType: "target_recognized",
  payload: { candidateMap: [1, 2, 3] }
}), /cannot store puzzle state/);
assert.throws(() => event({
  eventType: "activity_completed",
  payload: { exact_move: { index: 4, digit: 2 } }
}), /cannot store puzzle state/);

{
  const events = [
    event({ eventId: "exposure", eventType: "exact_move_revealed", occurredAt: "2026-01-01T10:00:00Z" }),
    event({ eventId: "completion", eventType: "activity_completed", occurredAt: "2026-01-01T10:01:00Z" })
  ];
  const skill = reduceSkillState("w-wing", events, { now: "2026-01-01T11:00:00Z" });
  assert.equal(skill.state, "learning", "exact-move reveal and completion cannot grant mastery");
  assert.equal(skill.successCount, 0);
}

{
  const selfReported = reduceSkillState("w-wing", [
    event({
      eventId: "self-report",
      eventType: "placement_self_reported",
      occurredAt: "2026-01-01T10:00:00Z",
      payload: { status: "known" }
    })
  ], { now: "2026-01-01T11:00:00Z" });
  assert.equal(selfReported.state, "mastered");
  assert.equal(selfReported.provisional, true);
  assert.equal(selfReported.selfReport, "known");
  assert.equal(selfReported.reviewDueAt, "2026-01-08T10:00:00.000Z");
  const selfReportReview = reduceSkillState("w-wing", [
    event({
      eventId: "self-report-delayed",
      eventType: "placement_self_reported",
      occurredAt: "2026-01-01T10:00:00Z",
      payload: { status: "known" }
    })
  ], { now: "2026-01-09T11:00:00Z" });
  assert.equal(selfReportReview.state, "review-due", "provisional self-report must receive a later retrieval check");
}

const durableEvents = [
  recognition("success-1", "state-a", "2026-01-01T10:00:00Z", "none"),
  recognition("same-state", "state-a", "2026-01-01T11:00:00Z", "none"),
  recognition("success-2", "state-b", "2026-01-02T10:00:00Z", "tool"),
  recognition("success-3", "state-c", "2026-01-03T10:00:00Z", "search-focus")
];
{
  const skill = reduceSkillState("w-wing", durableEvents, { now: "2026-01-04T10:00:00Z" });
  assert.equal(skill.state, "mastered");
  assert.equal(skill.provisional, false);
  assert.equal(skill.distinctStateCount, 3, "same-state repetitions must not add distinct evidence");
  assert.equal(skill.distinctDateCount, 3);
  assert.equal(skill.unaidedSuccessCount, 2);
  assert.equal(skill.withoutLocationCount, 4);
  assert.deepEqual(
    skill,
    reduceSkillState("w-wing", durableEvents, { now: "2026-01-04T10:00:00Z" }),
    "evidence replay must be deterministic"
  );
}
{
  const stale = reduceSkillState("w-wing", durableEvents, { now: "2026-01-11T10:00:00Z" });
  assert.equal(stale.state, "review-due", "delayed evidence should be requested after the review interval");
}
{
  const contradicted = reduceSkillState("w-wing", [
    ...durableEvents,
    event({ eventId: "miss-1", eventType: "focus_action_incorrect", occurredAt: "2026-01-04T10:00:00Z" }),
    event({ eventId: "guess-1", eventType: "learner_reported_guess", occurredAt: "2026-01-04T10:01:00Z" })
  ], { now: "2026-01-04T11:00:00Z" });
  assert.equal(contradicted.state, "review-due");
  assert.equal(contradicted.recentContradictionCount, 2);
}

const indexStarted = performance.now();
const activityIndex = buildCampaignActivityIndex();
const indexBuildMs = performance.now() - indexStarted;
assert.equal(activityIndex.version, CAMPAIGN_ACTIVITY_INDEX_VERSION);
assert.equal(validateCampaignActivityIndex(activityIndex), true);
assert.ok(indexBuildMs < 500, `campaign index should build from metadata in under 500ms, took ${indexBuildMs.toFixed(1)}ms`);
for (const technique of techniqueNodes) {
  for (const activityType of ["lesson", "find-pattern", "near-miss", "complete-puzzle"]) {
    assert.ok(
      activityIndex.records.some((record) => record.focusTechniqueId === technique.id && record.activityType === activityType),
      `${technique.id} needs a ${activityType} source`
    );
  }
}
assert.ok(
  activityIndex.records
    .filter((record) => record.activityType === "complete-puzzle" && record.sourceKind === "practice")
    .every((record) => !record.noveltyCertified),
  "complete-puzzle practice must remain gated until its whole path is profile-certified"
);
assert.ok(
  activityIndex.records
    .filter((record) => record.sourceKind === "catalog")
    .every((record) => record.allowedTechniqueIds.includes(record.focusTechniqueId))
);

const tierOneIds = techniqueNodes.filter((node) => node.tier === 1).map((node) => node.id);
const wWingCatalog = queryCampaignActivities(activityIndex, {
  focusTechniqueId: "w-wing",
  masteredTechniqueIds: tierOneIds,
  activityTypes: ["full-puzzle"]
});
assert.equal(wWingCatalog.length, 0, "the selector must not treat multi-novel-technique W-Wing puzzles as safe");
const runtimePuzzleRecord = {
  ...activityIndex.records.find((record) => record.sourceKind === "catalog"),
  focusTechniqueId: "w-wing",
  allowedTechniqueIds: ["w-wing", "hidden-pair"],
  runtimeLaunchCertified: true
};
const runtimePuzzleIndex = { ...activityIndex, records: [runtimePuzzleRecord] };
assert.equal(queryCampaignActivities(runtimePuzzleIndex, {
  focusTechniqueId: "w-wing",
  masteredTechniqueIds: [],
  activityTypes: ["full-puzzle"]
}).length, 0, "a launch-certified puzzle must still reject a second unmastered technique");
assert.equal(queryCampaignActivities(runtimePuzzleIndex, {
  focusTechniqueId: "w-wing",
  masteredTechniqueIds: ["hidden-pair"],
  activityTypes: ["full-puzzle"]
}).length, 1, "a launch-certified puzzle may use mastered techniques plus one focus technique");
const wWingFocused = queryCampaignActivities(activityIndex, {
  focusTechniqueId: "w-wing",
  masteredTechniqueIds: tierOneIds,
  activityTypes: ["lesson", "find-pattern", "near-miss"]
});
assert.ok(wWingFocused.length >= 3, "focused activities must remain available when no full puzzle meets the novelty budget");
assert.ok(wWingFocused.every((record) => record.allowedTechniqueIds.every((id) => tierOneIds.includes(id) || id === "w-wing")));

const profile = {
  id: "experienced",
  goal: "solve-more-puzzles",
  preferredMinutes: 15,
  avoidedTechniqueIds: []
};
const experiencedSkills = techniqueNodes.map((node) => ({
  techniqueId: node.id,
  state: node.tier === 1 ? "mastered" : "unseen",
  distinctStateCount: node.tier === 1 ? 3 : 0,
  recentContradictionCount: 0
}));
const reviewedPrior = {
  version: "test-prior-v1",
  sourceStudyCommit: "test-only",
  values: {
    "w-wing": 1,
    skyscraper: 0.6,
    "two-string-kite": 0.5,
    "xy-wing": 0.4
  },
  limitations: "Test-only completion-coverage prior."
};
const experienced = selectNextActivity({
  profile,
  skillGraph: experiencedSkills,
  history: { campaignSequence: 0, recentActivities: [] },
  activityIndex,
  researchPrior: reviewedPrior,
  now: "2026-07-26T10:00:00Z"
});
assert.equal(experienced.kind, "recommendation");
assert.equal(experienced.activity.focusTechniqueId, "w-wing");
assert.ok(experienced.explanation.reasonCodes.includes("COVERAGE_VALUE"));
assert.equal(experienced.inputVersions.researchPriorVersion, "test-prior-v1");
assert.deepEqual(experienced.activity.recommendationSnapshot.inputVersions, experienced.inputVersions);
assert.match(experienced.activity.recommendationSnapshot.researchLimitations, /Test-only/);
assert.doesNotMatch(JSON.stringify(experienced.consideredCandidates), /"grid"|"solution"|"notes"/);

const beginner = selectNextActivity({
  profile: { ...profile, id: "beginner", goal: "learn-techniques" },
  skillGraph: [],
  history: { campaignSequence: 0, recentActivities: [] },
  activityIndex,
  researchPrior: EMPTY_RESEARCH_PRIOR,
  now: "2026-07-26T10:00:00Z"
});
assert.equal(beginner.kind, "recommendation");
assert.notEqual(beginner.activity.focusTechniqueId, experienced.activity.focusTechniqueId);
assert.equal(beginner.activity.activityType, "lesson");

const sameDayContinuation = selectNextActivity({
  profile: { ...profile, id: "beginner", goal: "learn-techniques" },
  skillGraph: [],
  history: { campaignSequence: 1, recentActivities: [beginner.activity] },
  activityIndex,
  now: "2026-07-26T10:05:00Z"
});
assert.equal(sameDayContinuation.kind, "recommendation", "the selector must not impose a date gate");
assert.notEqual(sameDayContinuation.activity.activityId, beginner.activity.activityId);

const reviewFirst = selectNextActivity({
  profile: { ...profile, id: "reviewer" },
  skillGraph: [{
    techniqueId: "last-digit",
    state: "review-due",
    distinctStateCount: 3,
    recentContradictionCount: 0,
    reviewDueAt: "2026-07-01T10:00:00Z"
  }],
  history: { campaignSequence: 0, recentActivities: [] },
  activityIndex,
  researchPrior: reviewedPrior,
  now: "2026-07-26T10:00:00Z"
});
assert.equal(reviewFirst.activity.focusTechniqueId, "last-digit", "eligible review work must take priority over new material");
assert.ok(reviewFirst.explanation.reasonCodes.includes("REVIEW_DUE"));

const avoided = selectNextActivity({
  profile: { ...profile, avoidedTechniqueIds: ["w-wing"] },
  skillGraph: experiencedSkills,
  history: { campaignSequence: 0, recentActivities: [] },
  activityIndex,
  researchPrior: reviewedPrior,
  now: "2026-07-26T10:00:00Z"
});
assert.notEqual(avoided.activity?.focusTechniqueId, "w-wing");
assert.ok(
  avoided.consideredCandidates.some((candidate) => candidate.techniqueId === "w-wing" && candidate.gateReasons?.includes("LEARNER_AVOIDED"))
);

const trace = formatSelectorTrace(experienced);
assert.match(trace, /Selected: w-wing/);
assert.match(trace, /COVERAGE_VALUE/);
assert.match(trace, /Considered:/);

const selectionStarted = performance.now();
for (let sequence = 0; sequence < 100; sequence += 1) {
  selectNextActivity({
    profile,
    skillGraph: experiencedSkills,
    history: { campaignSequence: sequence, recentActivities: [] },
    activityIndex,
    researchPrior: reviewedPrior,
    now: "2026-07-26T10:00:00Z"
  });
}
const selectionMs = performance.now() - selectionStarted;
assert.ok(selectionMs < 500, `100 metadata-only selections should complete under 500ms, took ${selectionMs.toFixed(1)}ms`);

{
  const storage = createMemoryCampaignStorage();
  await storage.putProfile(profile);
  await storage.putActivity(experienced.activity);
  await storage.putCampaignState({
    profileId: profile.id,
    currentActivityId: experienced.activity.activityId,
    lastCompletedActivityId: null,
    campaignSequence: 0,
    updatedAt: "2026-07-26T10:00:00.000Z"
  });
  await storage.putSkillSnapshot({
    profileId: profile.id,
    techniqueId: "w-wing",
    state: "practicing"
  });
  const completionEvent = event({
    eventId: "stored-completion",
    profileId: profile.id,
    activityId: experienced.activity.activityId,
    eventType: "activity_completed",
    occurredAt: "2026-07-26T10:10:00Z"
  });
  await storage.completeActivity({
    activityId: experienced.activity.activityId,
    profileId: profile.id,
    evidenceEvents: [completionEvent],
    completedAt: "2026-07-26T10:10:00.000Z"
  });
  assert.equal((await storage.getActivity(experienced.activity.activityId)).completedAt, "2026-07-26T10:10:00.000Z");
  assert.equal((await storage.getCampaignState(profile.id)).campaignSequence, 1);
  assert.equal((await storage.getCampaignState(profile.id)).currentActivityId, null);
  assert.equal(await storage.getSkillSnapshot(profile.id, "w-wing"), null, "completion must invalidate affected snapshots");
  assert.equal((await storage.listEvidence({ profileId: profile.id })).length, 1);
  await assert.rejects(() => storage.completeActivity({
    activityId: experienced.activity.activityId,
    profileId: profile.id,
    evidenceEvents: [event({
      eventId: "duplicate-completion-attempt",
      profileId: profile.id,
      activityId: experienced.activity.activityId,
      eventType: "activity_completed",
      occurredAt: "2026-07-26T10:11:00Z"
    })],
    completedAt: "2026-07-26T10:11:00.000Z"
  }), /already completed/);
  assert.equal((await storage.getCampaignState(profile.id)).campaignSequence, 1, "duplicate completion must not advance the campaign twice");
  await assert.rejects(() => storage.appendEvidence(completionEvent), /Duplicate append-only key/);
  const exported = await storage.exportData();
  assert.equal(exported.schemaVersion, 1);
  assert.equal(exported.profiles.length, 1);
  assert.equal(exported.evidence_events.length, 1);
  assert.doesNotMatch(JSON.stringify(exported.evidence_events), /"grid"|"solution"|"notes"/);
  await storage.clearAll();
  assert.equal((await storage.exportData()).profiles.length, 0);
}

{
  const storage = createMemoryCampaignStorage();
  const activity = { ...beginner.activity, activityId: "atomic-activity", profileId: "atomic-profile" };
  const duplicate = event({
    eventId: "atomic-duplicate",
    profileId: "atomic-profile",
    activityId: activity.activityId,
    eventType: "activity_completed"
  });
  await storage.putActivity(activity);
  await storage.putCampaignState({ profileId: "atomic-profile", currentActivityId: activity.activityId, campaignSequence: 0 });
  await storage.appendEvidence(duplicate);
  await assert.rejects(() => storage.completeActivity({
    activityId: activity.activityId,
    profileId: "atomic-profile",
    evidenceEvents: [duplicate],
    completedAt: "2026-07-26T10:10:00.000Z"
  }), /Duplicate append-only key/);
  assert.equal((await storage.getActivity(activity.activityId)).completedAt, null, "failed completion must not partially update the activity");
  assert.equal((await storage.getCampaignState("atomic-profile")).campaignSequence, 0, "failed completion must not advance the campaign");
}

{
  const placementEvents = [
    event({
      eventId: "placement-recognition",
      eventType: "target_recognized",
      occurredAt: "2026-01-01T10:00:00Z",
      puzzleStateFingerprint: "placement-state",
      payload: { recognitionKind: "placement" }
    }),
    event({
      eventId: "placement-complete",
      eventType: "placement_check_completed",
      occurredAt: "2026-01-01T10:00:00Z",
      payload: { result: "success" }
    })
  ];
  const placementSkill = reduceSkillState("w-wing", placementEvents, { now: "2026-01-01T11:00:00Z" });
  assert.equal(placementSkill.state, "mastered");
  assert.equal(placementSkill.provisional, true, "one successful placement check remains provisional");
}

{
  const assistedPlacement = reduceSkillState("w-wing", [
    event({
      eventId: "z-recognition-sorts-after-without-policy-order",
      eventType: "target_recognized",
      occurredAt: "2026-01-01T10:00:00Z",
      assistanceLevel: "exact-move",
      puzzleStateFingerprint: "assisted-placement-state",
      payload: { recognitionKind: "placement" }
    }),
    event({
      eventId: "a-placement-result",
      eventType: "placement_check_completed",
      occurredAt: "2026-01-01T10:00:00Z",
      assistanceLevel: "exact-move",
      payload: { result: "needs-practice" }
    })
  ], { now: "2026-01-01T11:00:00Z" });
  assert.equal(assistedPlacement.state, "learning");
  assert.equal(assistedPlacement.placementNeedsPractice, true, "placement result must win same-timestamp UUID ordering");
}

{
  let eventSequence = 0;
  const storage = createMemoryCampaignStorage();
  const session = createCampaignSession({
    storage,
    now: () => new Date("2026-07-26T11:00:00Z"),
    eventId: () => `observed-${eventSequence++}`
  });
  const started = await session.beginObservedPlacement();
  assert.equal(started.placementRequired, true, "observed placement stays provisional until the puzzle is completed");
  assert.equal(started.profile.goal, null, "a learner does not need to declare a goal");
  assert.equal(started.currentActivity.activityType, "find-pattern");
  assert.equal(started.currentActivity.observationPlacement, true);
  assert.deepEqual(started.currentActivity.certificationSnapshot.allowedTechniqueIds, ["last-digit"]);

  let adapted = await session.completeCurrentActivity({ recognized: true });
  let observedSkill = adapted.skills.find((skill) => skill.techniqueId === "last-digit");
  assert.equal(adapted.placementRequired, true, "successful evidence should continue the capped foundation calibration");
  assert.equal(adapted.profile.goal, "solve-more-puzzles");
  assert.equal(adapted.profile.goalSource, "observed");
  assert.equal(adapted.profile.goalInference.policyVersion, CAMPAIGN_INFERENCE_POLICY_VERSION);
  assert.equal(observedSkill.state, "mastered");
  assert.equal(observedSkill.provisional, true, "one observed application remains provisional");
  assert.ok(adapted.currentActivity, "observed placement must immediately offer the next activity");
  assert.notEqual(adapted.currentActivity.focusTechniqueId, "last-digit");
  assert.equal(
    adapted.currentActivity.recommendationSnapshot.profileSnapshot.goalSource,
    "observed",
    "the inferred profile basis must be reproducible"
  );
  for (let observation = 1; observation < 3; observation += 1) {
    await session.startCurrentActivity();
    adapted = await session.completeCurrentActivity({ recognized: true });
  }
  observedSkill = adapted.skills.find((skill) => skill.techniqueId === "last-digit");
  assert.equal(adapted.placementRequired, false, "observed placement must stay capped");
  assert.ok(adapted.currentActivity, "the regular campaign recommendation must be ready after calibration");
  assert.equal(adapted.currentActivity.observationPlacement, undefined);

  const corrected = await session.correctGoal("learn-techniques");
  assert.equal(corrected.profile.goal, "learn-techniques");
  assert.equal(corrected.profile.goalSource, "learner");
  assert.equal(corrected.profile.goalInference, null);
  assert.ok((await storage.listEvidence({ profileId: "local" })).some((item) => (
    item.eventType === "profile_corrected" &&
    item.techniqueId === null &&
    item.payload.goal === "learn-techniques"
  )), "goal correction must be append-only evidence");
}

{
  let eventSequence = 0;
  const storage = createMemoryCampaignStorage();
  const session = createCampaignSession({
    storage,
    now: () => new Date("2026-07-26T11:30:00Z"),
    eventId: () => `observed-assisted-${eventSequence++}`
  });
  await session.beginObservedPlacement();
  await session.recordAssistance("exact-move");
  const adapted = await session.completeCurrentActivity({ recognized: true });
  const observedSkill = adapted.skills.find((skill) => skill.techniqueId === "last-digit");
  assert.equal(adapted.profile.goal, "build-confidence");
  assert.notEqual(observedSkill.state, "mastered", "exact-move placement cannot infer mastery");
  assert.equal(observedSkill.placementNeedsPractice, true);
  assert.equal(adapted.currentActivity.focusTechniqueId, "last-digit", "assisted placement should reinforce the observed gap");
  assert.equal(adapted.currentActivity.activityType, "find-pattern");
  assert.ok(adapted.evidence.some((item) => (
    item.eventType === "placement_check_completed" &&
    item.payload.result === "needs-practice"
  )));
}

{
  let eventSequence = 0;
  const storage = createMemoryCampaignStorage();
  const session = createCampaignSession({
    storage,
    now: () => new Date("2026-07-26T11:45:00Z"),
    eventId: () => `placement-puzzle-${eventSequence++}`
  });
  let model = await session.beginPlacementPuzzle({
    canonicalPuzzleId: "easy-0001",
    sourceId: "easy-0001",
    allowedTechniqueIds: ["last-digit", "naked-single", "hidden-single"]
  });
  assert.equal(model.currentActivity.activityType, "placement-puzzle");
  assert.equal(model.currentActivity.focusTechniqueId, null);
  assert.equal(model.currentActivity.certificationSnapshot.difficulty, "easy");
  assert.equal(model.currentActivity.estimatedMinutes, 8);
  assert.ok(model.currentActivity.recommendationSnapshot.reasonCodes.includes("LEARNER_SELECTED_PUZZLE_LEVEL"));
  assert.equal(model.currentActivity.certificationSnapshot.diagnostic, true);
  assert.equal(model.currentActivity.certificationSnapshot.noveltyBudget, null);
  assert.equal(model.activities.length, 1);

  await session.recordPlacementTechnique("naked-single");
  await session.recordAssistance("exact-move");
  await session.recordPlacementTechnique("hidden-single");
  model = await session.completePlacementPuzzle();
  assert.equal(model.placementRequired, false);
  assert.ok(model.currentActivity, "completion must immediately select the next learning activity");
  assert.notEqual(model.currentActivity.activityType, "placement-puzzle");
  assert.equal(model.profile.placementMethod, "observed-puzzle");
  assert.equal(model.profile.goal, "build-confidence", "deep assistance should conservatively infer a confidence path");
  const placementActivity = model.activities.find((activity) => activity.activityType === "placement-puzzle");
  assert.ok(placementActivity.completedAt);
  const placementEvidence = await storage.listEvidence({ activityId: placementActivity.activityId });
  assert.equal(placementEvidence.filter((item) => item.eventType === "activity_completed").length, 1);
  assert.equal(placementEvidence.filter((item) => item.eventType === "target_recognized").length, 2);
  assert.equal(
    placementEvidence.find((item) => item.techniqueId === "hidden-single" && item.eventType === "target_recognized").assistanceLevel,
    "exact-move"
  );
  assert.doesNotMatch(
    JSON.stringify(placementEvidence),
    /"grid"|"solution"|"candidateMap"|"notes"|"exactMove"/i
  );
  assert.notEqual(
    model.skills.find((skill) => skill.techniqueId === "hidden-single").state,
    "mastered",
    "an exact-move placement must not grant mastery"
  );
}

{
  const session = createCampaignSession({
    storage: createMemoryCampaignStorage(),
    now: () => new Date("2026-07-26T11:47:00Z")
  });
  const model = await session.beginPlacementPuzzle({
    canonicalPuzzleId: "hard-0001",
    sourceId: "hard-0001",
    allowedTechniqueIds: ["last-digit", "naked-single", "hidden-single", "pointing-candidates"],
    difficulty: "hard"
  });
  assert.equal(model.currentActivity.certificationSnapshot.difficulty, "hard");
  assert.equal(model.currentActivity.estimatedMinutes, 14);
}

{
  const storage = createMemoryCampaignStorage();
  const session = createCampaignSession({
    storage,
    now: () => new Date("2026-07-26T11:50:00Z"),
    eventId: (() => {
      let sequence = 0;
      return () => `placement-exposure-${sequence++}`;
    })()
  });
  await session.beginPlacementPuzzle({
    canonicalPuzzleId: "easy-0002",
    sourceId: "easy-0002",
    allowedTechniqueIds: ["last-digit", "naked-single"]
  });
  const model = await session.completePlacementPuzzle();
  assert.ok(model.skills.every((skill) => skill.state !== "mastered"), "puzzle completion alone must not grant mastery");
}

{
  let clockTick = 0;
  let eventSequence = 0;
  const storage = createMemoryCampaignStorage();
  const session = createCampaignSession({
    storage,
    now: () => new Date(Date.UTC(2026, 6, 26, 12, 0, clockTick++)),
    eventId: () => `session-event-${eventSequence++}`
  });
  const beginnerPlacement = await session.savePlacement({
    goal: "learn-techniques",
    preferredMinutes: 10,
    reports: {},
    skipped: true
  });
  assert.equal(beginnerPlacement.placementRequired, false);
  const beginnerCampaign = await session.ensureRecommendation();
  assert.ok(beginnerCampaign.currentActivity);
  const beginnerFocus = beginnerCampaign.currentActivity.focusTechniqueId;

  const beginnerStarted = await session.startCurrentActivity();
  assert.ok(beginnerStarted.currentActivity.startedAt);
  const startedEvidenceCount = (await storage.listEvidence({
    activityId: beginnerStarted.currentActivity.activityId
  })).filter((item) => item.eventType === "activity_started").length;
  await session.startCurrentActivity();
  assert.equal(
    (await storage.listEvidence({ activityId: beginnerStarted.currentActivity.activityId }))
      .filter((item) => item.eventType === "activity_started").length,
    startedEvidenceCount,
    "reload/resume must not duplicate activity-started evidence"
  );

  const afterLesson = await session.completeCurrentActivity();
  assert.ok(afterLesson.currentActivity, "completion should immediately offer a next activity");
  assert.equal(afterLesson.campaignState.campaignSequence, 1);
  assert.equal(
    afterLesson.skills.find((skill) => skill.techniqueId === beginnerFocus).state,
    "learning",
    "lesson completion alone must not grant mastery"
  );
  assert.equal(
    afterLesson.currentActivity.createdAt.slice(0, 10),
    beginnerStarted.currentActivity.startedAt.slice(0, 10),
    "same-date continuation must remain available"
  );

  const exportBeforeCorrection = await session.exportData();
  const evidenceCount = exportBeforeCorrection.evidence_events.length;
  const corrected = await session.correctSkill(beginnerFocus, "known");
  assert.equal(corrected.skills.find((skill) => skill.techniqueId === beginnerFocus).provisional, true);
  const exportAfterCorrection = await session.exportData();
  assert.equal(exportAfterCorrection.evidence_events.length, evidenceCount + 1, "corrections must append evidence");
  assert.ok(exportAfterCorrection.evidence_events.some((item) => item.eventType === "profile_corrected"));
  assert.doesNotMatch(JSON.stringify(exportAfterCorrection.evidence_events), /"grid"|"solution"|"candidate"|"notes"|"exactMove"/i);

  await session.resetProgress();
  const reset = await session.loadModel();
  assert.equal(reset.placementRequired, true);
  assert.equal(reset.activities.length, 0);
  assert.equal(reset.evidence.length, 0);
  await session.deleteData();
  assert.equal((await session.exportData()).profiles.length, 0);
}

{
  const storage = createMemoryCampaignStorage();
  let eventSequence = 0;
  const session = createCampaignSession({
    storage,
    now: () => new Date("2026-07-26T14:00:00Z"),
    eventId: () => `ordinary-${eventSequence++}`
  });
  await session.savePlacement({ skipped: true });
  await session.recordObservedTechnique({
    techniqueId: "last-digit",
    sourceId: "catalog-easy-1",
    canonicalPuzzleId: "catalog-easy-1",
    replayIndex: 4,
    assistanceLevel: "none",
    source: "generated"
  });
  let model = await session.loadModel();
  let skill = model.skills.find((item) => item.techniqueId === "last-digit");
  assert.equal(skill.state, "practicing");
  assert.equal(skill.provisional, false);
  assert.equal(skill.distinctStateCount, 1);
  assert.equal(skill.distinctDateCount, 1);
  assert.equal(skill.unaidedSuccessCount, 1);
  assert.notEqual(skill.state, "mastered", "one inferred move cannot grant durable mastery");

  await session.recordObservedTechnique({
    techniqueId: "last-digit",
    sourceId: "catalog-easy-1",
    canonicalPuzzleId: "catalog-easy-1",
    replayIndex: 4,
    assistanceLevel: "tool",
    source: "generated"
  });
  model = await session.loadModel();
  skill = model.skills.find((item) => item.techniqueId === "last-digit");
  assert.equal(skill.successCount, 2);
  assert.equal(skill.distinctStateCount, 1, "repeated recognition in the same state must not become distinct mastery evidence");
  assert.notEqual(skill.state, "mastered");
  const ordinaryEvidence = await storage.listEvidence({ techniqueId: "last-digit" });
  assert.equal(ordinaryEvidence.filter((item) => item.payload?.recognitionKind === "ordinary-play").length, 2);
  assert.ok(ordinaryEvidence.every((item) => item.activityId === null));
  assert.ok(ordinaryEvidence.every((item) => item.payload.observationPolicyVersion === CAMPAIGN_OBSERVATION_POLICY_VERSION));
  assert.doesNotMatch(JSON.stringify(ordinaryEvidence), /"grid"|"solution"|"candidate"|"notes"|"exactMove"/i);

  model = await session.ensureRecommendation();
  assert.notEqual(
    `${model.currentActivity.focusTechniqueId}:${model.currentActivity.activityType}`,
    "last-digit:lesson",
    "ordinary-play recognition must prevent reteaching the observed technique as unseen"
  );
}

{
  const newStorage = createMemoryCampaignStorage();
  const experiencedStorage = createMemoryCampaignStorage();
  let newEventId = 0;
  let experiencedEventId = 0;
  const newSession = createCampaignSession({
    storage: newStorage,
    now: () => new Date("2026-07-26T15:00:00Z"),
    eventId: () => `new-${newEventId++}`
  });
  const experiencedSession = createCampaignSession({
    storage: experiencedStorage,
    now: () => new Date("2026-07-26T15:00:00Z"),
    eventId: () => `experienced-${experiencedEventId++}`
  });
  await newSession.savePlacement({ skipped: true });
  const reports = Object.fromEntries(techniqueNodes.map((node) => [
    node.id,
    node.tier === 1 ? "known" : "unknown"
  ]));
  await experiencedSession.savePlacement({ reports });
  const newRecommendation = (await newSession.ensureRecommendation()).currentActivity;
  const experiencedRecommendation = (await experiencedSession.ensureRecommendation()).currentActivity;
  assert.notEqual(
    newRecommendation.focusTechniqueId,
    experiencedRecommendation.focusTechniqueId,
    "new and Tier 1 self-reported learners must receive different recommendations"
  );
  assert.ok(
    !tierOneIds.includes(experiencedRecommendation.focusTechniqueId),
    "placement should skip provisionally known Tier 1 techniques"
  );
  const tierOneSkill = (await experiencedSession.loadModel()).skills.find((skill) => skill.techniqueId === tierOneIds[0]);
  assert.equal(tierOneSkill.provisional, true);
  assert.equal(tierOneSkill.state, "mastered", "known self-report should not force a lesson");
}

{
  const storage = createMemoryCampaignStorage();
  let eventSequence = 0;
  const session = createCampaignSession({
    storage,
    now: () => new Date("2026-07-26T18:00:00Z"),
    eventId: () => `assistance-${eventSequence++}`
  });
  const reports = Object.fromEntries(techniqueNodes.map((node) => [node.id, node.id === "last-digit" ? "learning" : "known"]));
  await session.savePlacement({ reports });
  let model = await session.ensureRecommendation();
  assert.equal(model.currentActivity.focusTechniqueId, "last-digit");
  assert.equal(model.currentActivity.activityType, "find-pattern");
  await session.startCurrentActivity();
  await session.recordAssistance("exact-move");
  model = await session.completeCurrentActivity({ recognized: true });
  const skill = model.skills.find((item) => item.techniqueId === "last-digit");
  assert.notEqual(skill.state, "mastered", "an exact-move reveal must not grant mastery");
  assert.equal(skill.withoutLocationCount, 0);
  const evidence = await storage.listEvidence({ techniqueId: "last-digit" });
  assert.ok(evidence.some((item) => item.eventType === "exact_move_revealed"));
  assert.ok(evidence.some((item) => item.eventType === "target_recognized" && item.assistanceLevel === "exact-move"));
}

console.log(`campaign contracts passed: ${activityIndex.records.length} indexed activities, ${indexBuildMs.toFixed(1)}ms index build, ${selectionMs.toFixed(1)}ms for 100 selections`);

function event(overrides) {
  return createEvidenceEvent({
    profileId: overrides.profileId || "local",
    activityId: overrides.activityId || "activity-1",
    techniqueId: overrides.techniqueId || "w-wing",
    eventType: overrides.eventType,
    assistanceLevel: overrides.assistanceLevel || "none",
    puzzleStateFingerprint: overrides.puzzleStateFingerprint || null,
    occurredAt: overrides.occurredAt || "2026-01-01T00:00:00Z",
    payload: overrides.payload || {}
  }, { eventId: overrides.eventId });
}

function recognition(eventId, puzzleStateFingerprint, occurredAt, assistanceLevel) {
  return event({
    eventId,
    eventType: "target_recognized",
    puzzleStateFingerprint,
    occurredAt,
    assistanceLevel
  });
}

function masteredSkills(ids) {
  return Object.fromEntries(ids.map((techniqueId) => [techniqueId, { techniqueId, state: "mastered" }]));
}
