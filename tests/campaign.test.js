import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import {
  ASSISTANCE_LEVELS,
  buildCampaignActivityIndex,
  CAMPAIGN_ACTIVITY_INDEX_VERSION,
  CAMPAIGN_TECHNIQUE_GRAPH,
  createEvidenceEvent,
  createMemoryCampaignStorage,
  createPuzzleStateFingerprint,
  deepestAssistanceLevel,
  EMPTY_RESEARCH_PRIOR,
  formatSelectorTrace,
  prerequisitesReady,
  queryCampaignActivities,
  reduceSkillState,
  selectNextActivity,
  techniqueIdForName,
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
