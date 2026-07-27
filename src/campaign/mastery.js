import { ASSISTANCE_LEVELS, validateEvidenceEvent } from "./evidence.js";

export const DEFAULT_MASTERY_POLICY = Object.freeze({
  version: 1,
  masteryDistinctStates: 3,
  masteryDistinctDates: 3,
  masteryMinWithoutLocation: 2,
  reviewIntervalsDays: Object.freeze([7, 30]),
  contradictionWindow: 5
});

const SUCCESS_EVENT = "target_recognized";
const CONTRADICTION_EVENTS = new Set(["focus_action_incorrect", "learner_reported_guess"]);
const EXPOSURE_EVENTS = new Set([
  "activity_started",
  "tool_used",
  "search_focus_revealed",
  "structural_location_revealed",
  "exact_move_revealed",
  "placement_check_completed"
]);

export function reduceSkillState(techniqueId, events, {
  now = new Date(),
  policy = DEFAULT_MASTERY_POLICY,
  graphVersion = 1
} = {}) {
  validatePolicy(policy);
  const relevant = [...events]
    .filter((event) => event.techniqueId === techniqueId)
    .sort(compareEvidence);
  relevant.forEach(validateEvidenceEvent);

  const stateFingerprints = new Set();
  const successDates = new Set();
  let state = "unseen";
  let selfReport = null;
  let provisional = false;
  let unaidedSuccessCount = 0;
  let assistedSuccessCount = 0;
  let withoutLocationCount = 0;
  let contradictionCount = 0;
  let lastExposureAt = null;
  let lastSelfReportAt = null;
  let lastUnaidedSuccessAt = null;
  let lastSuccessAt = null;
  let successfulRetrievalsAfterMastery = 0;
  const recentCorrectness = [];

  for (const event of relevant) {
    if (EXPOSURE_EVENTS.has(event.eventType) || event.eventType === SUCCESS_EVENT) {
      lastExposureAt = event.occurredAt;
      if (state === "unseen") state = "learning";
    }

    if (event.eventType === "placement_self_reported" || event.eventType === "profile_corrected") {
      const report = normalizeSelfReport(event.payload);
      if (report) {
        selfReport = report;
        lastSelfReportAt = event.occurredAt;
        if (report === "known") {
          state = "mastered";
          provisional = true;
        } else if (report === "learning" || report === "unknown") {
          state = "learning";
          provisional = false;
        }
      }
    }

    if (event.eventType === "placement_check_completed" && event.payload?.result === "success") {
      state = "mastered";
      provisional = true;
      lastSelfReportAt = event.occurredAt;
    }

    if (CONTRADICTION_EVENTS.has(event.eventType)) {
      contradictionCount += 1;
      recentCorrectness.push(false);
      trimWindow(recentCorrectness, policy.contradictionWindow);
      continue;
    }

    if (event.eventType !== SUCCESS_EVENT) continue;
    const wasMastered = state === "mastered" || state === "review-due";
    recentCorrectness.push(true);
    trimWindow(recentCorrectness, policy.contradictionWindow);
    lastSuccessAt = event.occurredAt;
    successDates.add(event.localDate);
    if (event.puzzleStateFingerprint) stateFingerprints.add(event.puzzleStateFingerprint);

    if (event.assistanceLevel === "none") {
      unaidedSuccessCount += 1;
      lastUnaidedSuccessAt = event.occurredAt;
    } else {
      assistedSuccessCount += 1;
    }
    if (ASSISTANCE_LEVELS.indexOf(event.assistanceLevel) < ASSISTANCE_LEVELS.indexOf("structural-location")) {
      withoutLocationCount += 1;
    }

    if (state === "unseen" || state === "learning") state = "practicing";
    if (wasMastered && event.assistanceLevel !== "exact-move") {
      successfulRetrievalsAfterMastery += 1;
      if (provisional && ASSISTANCE_LEVELS.indexOf(event.assistanceLevel) < ASSISTANCE_LEVELS.indexOf("structural-location")) {
        provisional = false;
      }
    }

    const durableEvidence = (
      stateFingerprints.size >= policy.masteryDistinctStates &&
      successDates.size >= policy.masteryDistinctDates &&
      withoutLocationCount >= policy.masteryMinWithoutLocation
    );
    if (durableEvidence) {
      state = "mastered";
      provisional = false;
    } else if (state !== "mastered") {
      state = "practicing";
    }
  }

  const recentContradictions = recentCorrectness.filter((value) => !value).length;
  const reviewInterval = policy.reviewIntervalsDays[Math.min(successfulRetrievalsAfterMastery, policy.reviewIntervalsDays.length - 1)];
  const reviewDueAt = state === "mastered" && (lastSuccessAt || lastSelfReportAt)
    ? addDays(lastSuccessAt || lastSelfReportAt, reviewInterval)
    : null;
  const nowTime = new Date(now).getTime();
  if (state === "mastered" && (
    recentContradictions >= 2 ||
    (reviewDueAt && new Date(reviewDueAt).getTime() <= nowTime)
  )) {
    state = "review-due";
  }

  const totalSuccesses = unaidedSuccessCount + assistedSuccessCount;
  const confidence = clamp(
    (provisional ? 0.55 : 0) +
    Math.min(0.45, stateFingerprints.size * 0.12) +
    Math.min(0.2, successDates.size * 0.06) +
    Math.min(0.2, unaidedSuccessCount * 0.08) -
    recentContradictions * 0.12
  );

  return Object.freeze({
    profileId: relevant[0]?.profileId || "local",
    techniqueId,
    graphVersion,
    masteryPolicyVersion: policy.version,
    evidenceCursor: relevant.at(-1)?.eventId || null,
    state,
    confidence,
    provisional,
    selfReport,
    distinctStateCount: stateFingerprints.size,
    distinctDateCount: successDates.size,
    unaidedSuccessCount,
    assistedSuccessCount,
    withoutLocationCount,
    contradictionCount,
    recentContradictionCount: recentContradictions,
    successCount: totalSuccesses,
    lastExposureAt,
    lastUnaidedSuccessAt,
    reviewDueAt,
    updatedAt: new Date(now).toISOString()
  });
}

export function reduceAllSkills(techniqueIds, events, options = {}) {
  return techniqueIds.map((techniqueId) => reduceSkillState(techniqueId, events, options));
}

function normalizeSelfReport(payload) {
  const value = payload?.status ?? payload?.selfReport ?? payload?.result;
  if (value === true) return "known";
  if (value === false) return "unknown";
  return ["known", "learning", "unknown"].includes(value) ? value : null;
}

function compareEvidence(left, right) {
  return left.occurredAt.localeCompare(right.occurredAt) || left.eventId.localeCompare(right.eventId);
}

function trimWindow(values, size) {
  if (values.length > size) values.splice(0, values.length - size);
}

function addDays(value, days) {
  const date = new Date(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function clamp(value) {
  return Math.max(0, Math.min(1, Number(value.toFixed(3))));
}

function validatePolicy(policy) {
  if (!Number.isInteger(policy.version) || policy.version < 1) throw new Error("Mastery policy needs a positive version.");
  for (const key of ["masteryDistinctStates", "masteryDistinctDates", "masteryMinWithoutLocation", "contradictionWindow"]) {
    if (!Number.isInteger(policy[key]) || policy[key] < 1) throw new Error(`Invalid mastery policy field: ${key}`);
  }
  if (!Array.isArray(policy.reviewIntervalsDays) || !policy.reviewIntervalsDays.length) {
    throw new Error("Mastery policy needs review intervals.");
  }
}
