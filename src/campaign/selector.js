import {
  CAMPAIGN_ACTIVITY_INDEX_VERSION,
  queryCampaignActivities
} from "./activityIndex.js";
import {
  CAMPAIGN_TECHNIQUE_GRAPH,
  prerequisitesReady
} from "./techniqueGraph.js";

export const DEFAULT_SELECTOR_POLICY = Object.freeze({
  version: 1,
  weights: Object.freeze({
    coverageValue: 3,
    masteryNeed: 4,
    reviewUrgency: 5,
    recognitionBurden: -1.2,
    timeFit: 1.5,
    goalFit: 1,
    variety: 1,
    activityQuality: 2
  })
});

export const EMPTY_RESEARCH_PRIOR = Object.freeze({
  version: "pending-review",
  sourceStudyCommit: null,
  values: Object.freeze({}),
  limitations: "No reviewed completion-coverage prior is installed; recommendations use learner evidence and curriculum structure."
});

const REASON_PROSE = Object.freeze({
  PREREQUISITES_READY: "Its prerequisites are ready.",
  COVERAGE_VALUE: "It may add incremental puzzle-completion coverage; this is not a claim about learning efficiency.",
  RECENT_STRUGGLE: "Recent evidence suggests this deserves another look.",
  MORE_EVIDENCE_NEEDED: "Another distinct example will strengthen the mastery estimate.",
  REVIEW_DUE: "A retrieval review is due.",
  TIME_FIT: "The activity fits the learner's preferred session length.",
  LEARNER_SELECTED: "The learner requested this focus.",
  FALLBACK_NO_CERTIFIED_PUZZLE: "No full puzzle met the one-new-technique budget, so a focused activity was selected."
});

export function selectNextActivity({
  profile,
  skillGraph = [],
  history = {},
  activityIndex,
  researchPrior = EMPTY_RESEARCH_PRIOR,
  now = new Date(),
  policy = DEFAULT_SELECTOR_POLICY,
  graph = CAMPAIGN_TECHNIQUE_GRAPH
}) {
  validateSelectorInputs({ profile, activityIndex, policy, researchPrior });
  if (history.currentActivity && !isTerminalActivity(history.currentActivity)) {
    return resumeResult(history.currentActivity, activityIndex, graph, researchPrior, policy);
  }

  const skills = normalizeSkills(skillGraph);
  const masteredTechniqueIds = [...skills.values()]
    .filter((skill) => ["mastered", "review-due"].includes(skill.state))
    .map((skill) => skill.techniqueId);
  const recentCanonicalPuzzleIds = (history.recentActivities || [])
    .map((activity) => activity.canonicalPuzzleId)
    .filter(Boolean);
  const recentTechniqueIds = (history.recentActivities || [])
    .slice(-3)
    .map((activity) => activity.focusTechniqueId);
  const consideredCandidates = [];
  const candidates = [];

  for (const node of graph.nodes.filter((item) => item.kind === "technique")) {
    const skill = skills.get(node.id) || defaultSkill(node.id);
    const gateReasons = [];
    if (profile.avoidedTechniqueIds?.includes(node.id)) gateReasons.push("LEARNER_AVOIDED");
    if (skill.state === "mastered") gateReasons.push("ALREADY_MASTERED");
    if (!prerequisitesReady(node.id, skills, { graph })) gateReasons.push("PREREQUISITES_NOT_READY");

    const desiredTypes = activityTypesForSkill(skill);
    const activities = gateReasons.length ? [] : queryCampaignActivities(activityIndex, {
      focusTechniqueId: node.id,
      masteredTechniqueIds,
      activityTypes: desiredTypes,
      recentCanonicalPuzzleIds
    });
    if (!activities.length && !gateReasons.length) gateReasons.push("NO_CERTIFIED_ACTIVITY");

    if (gateReasons.length) {
      consideredCandidates.push({
        techniqueId: node.id,
        eligible: false,
        gateReasons
      });
      continue;
    }

    for (const activity of activities) {
      const components = scoreComponents({
        activity,
        skill,
        profile,
        researchPrior,
        recentTechniqueIds,
        now
      });
      const score = weightedScore(components, policy.weights);
      const reasonCodes = reasonCodesFor({ activity, skill, components });
      const candidate = {
        techniqueId: node.id,
        activity,
        components,
        score,
        reasonCodes,
        eligible: true
      };
      candidates.push(candidate);
      consideredCandidates.push(candidate);
    }
  }

  if (!candidates.length) {
    return {
      kind: "safe-fallback",
      failureReason: "NO_ELIGIBLE_CAMPAIGN_ACTIVITY",
      activity: null,
      explanation: {
        reasonCodes: ["FALLBACK_NO_CERTIFIED_PUZZLE"],
        text: REASON_PROSE.FALLBACK_NO_CERTIFIED_PUZZLE
      },
      consideredCandidates,
      policyVersion: policy.version,
      inputVersions: inputVersions({ graph, activityIndex, researchPrior, policy })
    };
  }

  const reviewCandidates = candidates.filter((candidate) => skills.get(candidate.techniqueId)?.state === "review-due");
  const rankedCandidates = reviewCandidates.length ? reviewCandidates : candidates;
  rankedCandidates.sort((left, right) => right.score - left.score || stableCandidateKey(left).localeCompare(stableCandidateKey(right)));
  const highestScore = rankedCandidates[0].score;
  const tied = rankedCandidates.filter((candidate) => Math.abs(candidate.score - highestScore) < 0.000001);
  const tieIndex = stableHash([
    profile.id,
    history.campaignSequence || 0,
    policy.version,
    activityIndex.version
  ].join("|")) % tied.length;
  const selected = tied[tieIndex];
  const createdAt = new Date(now).toISOString();
  const activityId = `campaign-${profile.id}-${history.campaignSequence || 0}-${stableHash(stableCandidateKey(selected)).toString(16)}`;
  const versions = inputVersions({ graph, activityIndex, researchPrior, policy });
  const activity = Object.freeze({
    activityId,
    profileId: profile.id,
    activityType: selected.activity.activityType,
    focusTechniqueId: selected.techniqueId,
    sourceKind: selected.activity.sourceKind,
    sourceId: selected.activity.sourceId,
    canonicalPuzzleId: selected.activity.canonicalPuzzleId,
    estimatedMinutes: selected.activity.estimatedMinutes,
    fixtureIndex: selected.activity.sourceKind === "practice"
      ? (history.campaignSequence || 0) % 10
      : null,
    createdAt,
    startedAt: null,
    targetReachedAt: null,
    completedAt: null,
    replacedAt: null,
    abandonedAt: null,
    replacementActivityId: null,
    recommendationSnapshot: Object.freeze({
      score: selected.score,
      components: Object.freeze({ ...selected.components }),
      weights: Object.freeze({ ...policy.weights }),
      reasonCodes: Object.freeze([...selected.reasonCodes]),
      tieBreakIndex: tieIndex,
      tieCount: tied.length,
      inputVersions: Object.freeze({ ...versions }),
      researchSourceStudyCommit: researchPrior.sourceStudyCommit || null,
      researchChecksum: researchPrior.checksum || null,
      researchLimitations: selected.components.coverageValue > 0 ? researchPrior.limitations : null
    }),
    certificationSnapshot: Object.freeze({
      activityIndexVersion: activityIndex.version,
      certificationVersion: selected.activity.certificationVersion,
      noveltyBudget: 1,
      allowedTechniqueIds: Object.freeze([...selected.activity.allowedTechniqueIds])
    }),
    lifecycleVersion: 1
  });

  return {
    kind: "recommendation",
    activity,
    explanation: {
      reasonCodes: selected.reasonCodes,
      text: selected.reasonCodes.map((code) => REASON_PROSE[code]).filter(Boolean).join(" ")
    },
    consideredCandidates,
    policyVersion: policy.version,
    inputVersions: versions
  };
}

export function formatSelectorTrace(result) {
  const lines = [
    `Result: ${result.kind}`,
    `Policy: ${result.policyVersion}`,
    `Versions: ${JSON.stringify(result.inputVersions)}`
  ];
  if (result.activity) {
    lines.push(`Selected: ${result.activity.focusTechniqueId} / ${result.activity.activityType} / ${result.activity.sourceId}`);
    lines.push(`Reasons: ${result.explanation.reasonCodes.join(", ")}`);
    lines.push(`Score: ${result.activity.recommendationSnapshot.score.toFixed(3)}`);
    lines.push(`Components: ${JSON.stringify(result.activity.recommendationSnapshot.components)}`);
  } else {
    lines.push(`Failure: ${result.failureReason}`);
  }
  lines.push("Considered:");
  for (const candidate of result.consideredCandidates) {
    lines.push(candidate.eligible
      ? `- ${candidate.techniqueId} ${candidate.activity.activityType}: ${candidate.score.toFixed(3)} [${candidate.reasonCodes.join(", ")}]`
      : `- ${candidate.techniqueId}: gated [${candidate.gateReasons.join(", ")}]`);
  }
  return lines.join("\n");
}

function activityTypesForSkill(skill) {
  if (skill.state === "review-due") return ["find-pattern", "near-miss"];
  if (skill.state === "unseen") return ["lesson"];
  if (skill.state === "learning") return ["find-pattern"];
  if (skill.state === "practicing") return skill.distinctStateCount >= 2
    ? ["full-puzzle", "near-miss", "find-pattern"]
    : ["near-miss", "find-pattern"];
  return [];
}

function scoreComponents({ activity, skill, profile, researchPrior, recentTechniqueIds, now }) {
  const preferredMinutes = profile.preferredMinutes || 15;
  const gap = Math.abs(preferredMinutes - activity.estimatedMinutes);
  const coverageValue = Number(researchPrior.values?.[activity.focusTechniqueId] || 0);
  return {
    coverageValue: clamp(coverageValue),
    masteryNeed: skill.state === "unseen" ? 1 : skill.state === "learning" ? 0.85 : skill.state === "practicing" ? 0.65 : 0.4,
    reviewUrgency: skill.state === "review-due" ? reviewUrgency(skill.reviewDueAt, now) : 0,
    recognitionBurden: activity.activityType === "lesson" ? 0.35 : activity.activityType === "full-puzzle" ? 0.7 : 0.15,
    timeFit: clamp(1 - gap / Math.max(preferredMinutes, 1)),
    goalFit: goalFit(profile.goal, activity.activityType),
    variety: recentTechniqueIds.includes(activity.focusTechniqueId) ? 0.1 : 1,
    activityQuality: activity.noveltyCertified ? 1 : 0
  };
}

function reasonCodesFor({ activity, skill, components }) {
  const reasons = ["PREREQUISITES_READY"];
  if (components.coverageValue > 0) reasons.push("COVERAGE_VALUE");
  if (skill.recentContradictionCount > 0) reasons.push("RECENT_STRUGGLE");
  if (skill.state === "review-due") reasons.push("REVIEW_DUE");
  else if (skill.state !== "unseen") reasons.push("MORE_EVIDENCE_NEEDED");
  if (components.timeFit >= 0.75) reasons.push("TIME_FIT");
  if (["find-pattern", "near-miss"].includes(activity.activityType) && skill.state === "practicing") {
    reasons.push("FALLBACK_NO_CERTIFIED_PUZZLE");
  }
  return reasons;
}

function normalizeSkills(skills) {
  if (skills instanceof Map) return skills;
  if (Array.isArray(skills)) return new Map(skills.map((skill) => [skill.techniqueId, skill]));
  return new Map(Object.entries(skills || {}).map(([techniqueId, skill]) => [techniqueId, { techniqueId, ...skill }]));
}

function defaultSkill(techniqueId) {
  return {
    techniqueId,
    state: "unseen",
    distinctStateCount: 0,
    recentContradictionCount: 0,
    reviewDueAt: null
  };
}

function weightedScore(components, weights) {
  return Number(Object.entries(components)
    .reduce((total, [name, value]) => total + value * (weights[name] || 0), 0)
    .toFixed(6));
}

function reviewUrgency(reviewDueAt, now) {
  if (!reviewDueAt) return 1;
  const overdueDays = Math.max(0, (new Date(now).getTime() - new Date(reviewDueAt).getTime()) / 86400000);
  return clamp(0.7 + overdueDays / 30);
}

function goalFit(goal, activityType) {
  if (goal === "learn-techniques") return activityType === "lesson" ? 1 : 0.8;
  if (goal === "solve-more-puzzles") return activityType === "full-puzzle" ? 1 : 0.75;
  return 0.8;
}

function inputVersions({ graph, activityIndex, researchPrior, policy }) {
  return {
    graphVersion: graph.version,
    selectorPolicyVersion: policy.version,
    activityIndexVersion: activityIndex.version,
    researchPriorVersion: researchPrior.version
  };
}

function resumeResult(activity, activityIndex, graph, researchPrior, policy) {
  return {
    kind: "resume",
    activity,
    explanation: { reasonCodes: ["RESUME_INCOMPLETE"], text: "Continue the current campaign activity." },
    consideredCandidates: [],
    policyVersion: policy.version,
    inputVersions: inputVersions({ graph, activityIndex, researchPrior, policy })
  };
}

function isTerminalActivity(activity) {
  return Boolean(activity.completedAt || activity.replacedAt || activity.abandonedAt);
}

function stableCandidateKey(candidate) {
  return `${candidate.techniqueId}|${candidate.activity.activityType}|${candidate.activity.sourceId}`;
}

function stableHash(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function clamp(value) {
  return Math.max(0, Math.min(1, value));
}

function validateSelectorInputs({ profile, activityIndex, policy, researchPrior }) {
  if (!profile?.id) throw new Error("Campaign selection requires a profile ID.");
  if (activityIndex?.version !== CAMPAIGN_ACTIVITY_INDEX_VERSION) throw new Error("Campaign selection requires a compatible activity index.");
  if (!Number.isInteger(policy?.version)) throw new Error("Campaign selection requires a versioned policy.");
  if (!researchPrior?.version || typeof researchPrior.values !== "object") throw new Error("Campaign selection requires a versioned research-prior interface.");
}
