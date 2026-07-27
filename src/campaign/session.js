import { buildCampaignActivityIndex, queryCampaignActivities } from "./activityIndex.js";
import {
  createEvidenceEvent,
  createPuzzleStateFingerprint,
  deepestAssistanceLevel
} from "./evidence.js";
import { DEFAULT_MASTERY_POLICY, reduceAllSkills } from "./mastery.js";
import {
  DEFAULT_SELECTOR_POLICY,
  EMPTY_RESEARCH_PRIOR,
  selectNextActivity
} from "./selector.js";
import {
  CAMPAIGN_TECHNIQUE_GRAPH,
  techniqueNameForId
} from "./techniqueGraph.js";

export const CAMPAIGN_PROFILE_SCHEMA_VERSION = 2;
export const CAMPAIGN_INFERENCE_POLICY_VERSION = 1;

export function createCampaignSession({
  storage,
  activityIndex = buildCampaignActivityIndex(),
  graph = CAMPAIGN_TECHNIQUE_GRAPH,
  researchPrior = EMPTY_RESEARCH_PRIOR,
  now = () => new Date(),
  eventId = () => `campaign-event-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`
} = {}) {
  if (!storage) throw new Error("Campaign session requires storage.");

  async function loadModel(profileId = "local") {
    const [profile, evidenceEvents, activities, storedState] = await Promise.all([
      storage.getProfile(profileId),
      storage.listEvidence({ profileId }),
      storage.listActivities(profileId),
      storage.getCampaignState(profileId)
    ]);
    const techniqueIds = graph.nodes.filter((node) => node.kind === "technique").map((node) => node.id);
    const effectiveProfile = applyProfileEvidence(profile, evidenceEvents);
    const skills = reduceAllSkills(techniqueIds, evidenceEvents, {
      now: currentDate(),
      policy: DEFAULT_MASTERY_POLICY,
      graphVersion: graph.version
    });
    const campaignState = storedState || defaultCampaignState(profileId, currentIso());
    const currentActivity = campaignState.currentActivityId
      ? activities.find((activity) => activity.activityId === campaignState.currentActivityId) || null
      : null;
    const lastCompletedActivity = campaignState.lastCompletedActivityId
      ? activities.find((activity) => activity.activityId === campaignState.lastCompletedActivityId) || null
      : null;
    return {
      profile: effectiveProfile,
      evidence: evidenceEvents,
      activities,
      campaignState,
      skills,
      currentActivity,
      lastCompletedActivity,
      placementRequired: !effectiveProfile?.placementCompletedAt,
      summary: summarizeSkills(skills)
    };
  }

  async function savePlacement({
    goal = null,
    preferredMinutes = 10,
    reports = {},
    skipped = false,
    profileId = "local"
  } = {}) {
    const timestamp = currentIso();
    const profile = normalizeProfile({
      ...(await storage.getProfile(profileId) || {}),
      id: profileId,
      goal,
      goalSource: goal ? "learner" : "observing",
      preferredMinutes,
      preferredMinutesSource: "learner",
      placementMethod: skipped ? "skipped" : "self-report",
      placementCompletedAt: timestamp,
      placementSkippedAt: skipped ? timestamp : null,
      placementDraftReports: {},
      updatedAt: timestamp
    }, timestamp);
    await storage.putProfile(profile);
    if (!skipped) {
      for (const node of graph.nodes.filter((item) => item.kind === "technique")) {
        await storage.appendEvidence(makeEvidence({
          profileId,
          techniqueId: node.id,
          eventType: "placement_self_reported",
          occurredAt: timestamp,
          payload: { status: normalizePlacementStatus(reports[node.id]) }
        }));
      }
    }
    await ensureCampaignState(profileId);
    return loadModel(profileId);
  }

  async function beginPlacementCheck({
    techniqueId,
    goal = null,
    preferredMinutes = 10,
    reports = {},
    profileId = "local"
  }) {
    assertTechnique(techniqueId);
    const timestamp = currentIso();
    const profile = normalizeProfile({
      ...(await storage.getProfile(profileId) || {}),
      id: profileId,
      goal,
      goalSource: goal ? "learner" : "observing",
      preferredMinutes,
      preferredMinutesSource: "learner",
      placementMethod: "self-report",
      placementCompletedAt: null,
      placementDraftReports: normalizeReports(reports),
      updatedAt: timestamp
    }, timestamp);
    await storage.putProfile(profile);
    const campaignState = await ensureCampaignState(profileId);
    if (campaignState.currentActivityId) return loadModel(profileId);
    const source = queryCampaignActivities(activityIndex, {
      focusTechniqueId: techniqueId,
      masteredTechniqueIds: [],
      activityTypes: ["near-miss"]
    })[0];
    if (!source) throw new Error(`No certified recognition check is available for ${techniqueNameForId(techniqueId, graph)}.`);
    const activity = {
      activityId: `placement-${profileId}-${campaignState.campaignSequence}-${techniqueId}`,
      profileId,
      activityType: "near-miss",
      focusTechniqueId: techniqueId,
      sourceKind: "practice",
      sourceId: source.sourceId,
      canonicalPuzzleId: null,
      estimatedMinutes: source.estimatedMinutes,
      fixtureIndex: campaignState.campaignSequence % 10,
      createdAt: timestamp,
      startedAt: timestamp,
      targetReachedAt: null,
      completedAt: null,
      replacedAt: null,
      abandonedAt: null,
      replacementActivityId: null,
      placementCheck: true,
      recommendationSnapshot: {
        reasonCodes: ["PLACEMENT_RECOGNITION_CHECK"],
        inputVersions: inputVersions()
      },
      certificationSnapshot: {
        activityIndexVersion: activityIndex.version,
        certificationVersion: source.certificationVersion,
        noveltyBudget: 1,
        allowedTechniqueIds: [...source.allowedTechniqueIds]
      },
      lifecycleVersion: 1
    };
    await storage.putActivity(activity);
    await storage.putCampaignState({
      ...campaignState,
      currentActivityId: activity.activityId,
      updatedAt: timestamp
    });
    await storage.appendEvidence(makeEvidence({
      profileId,
      activityId: activity.activityId,
      techniqueId,
      eventType: "placement_check_started",
      occurredAt: timestamp
    }));
    return loadModel(profileId);
  }

  async function beginObservedPlacement({
    goal = null,
    preferredMinutes = null,
    profileId = "local"
  } = {}) {
    const timestamp = currentIso();
    const profile = normalizeProfile({
      ...(await storage.getProfile(profileId) || {}),
      id: profileId,
      goal,
      goalSource: goal ? "learner" : "observing",
      preferredMinutes,
      preferredMinutesSource: preferredMinutes ? "learner" : "default",
      placementCompletedAt: null,
      placementMethod: "observed",
      updatedAt: timestamp
    }, timestamp);
    await storage.putProfile(profile);
    const campaignState = await ensureCampaignState(profileId);
    if (campaignState.currentActivityId) return loadModel(profileId);
    const techniqueId = firstObservedTechniqueId();
    const source = queryCampaignActivities(activityIndex, {
      focusTechniqueId: techniqueId,
      masteredTechniqueIds: [],
      activityTypes: ["find-pattern"]
    })[0];
    if (!source) throw new Error(`No certified starting-point puzzle is available for ${techniqueNameForId(techniqueId, graph)}.`);
    const activity = createPlacementActivity({
      profileId,
      campaignState,
      techniqueId,
      source,
      activityType: "find-pattern",
      timestamp,
      observationPlacement: true,
      profile
    });
    await storage.putActivity(activity);
    await storage.putCampaignState({
      ...campaignState,
      currentActivityId: activity.activityId,
      updatedAt: timestamp
    });
    await storage.appendEvidence(makeEvidence({
      profileId,
      activityId: activity.activityId,
      techniqueId,
      eventType: "placement_check_started",
      occurredAt: timestamp,
      payload: {
        source: "observed",
        activityType: activity.activityType,
        inferencePolicyVersion: CAMPAIGN_INFERENCE_POLICY_VERSION
      }
    }));
    return loadModel(profileId);
  }

  async function ensureRecommendation(profileId = "local") {
    let model = await loadModel(profileId);
    if (!model.profile?.placementCompletedAt || model.currentActivity) return model;
    const selection = selectNextActivity({
      profile: model.profile,
      skillGraph: model.skills,
      history: {
        campaignSequence: model.campaignState.campaignSequence,
        recentActivities: model.activities.filter((activity) => activity.completedAt)
      },
      activityIndex,
      researchPrior,
      now: currentDate(),
      graph
    });
    if (!selection.activity) return { ...model, selectionFailure: selection };
    const activity = selection.activity;
    await storage.putActivity(activity);
    await storage.putCampaignState({
      ...model.campaignState,
      currentActivityId: activity.activityId,
      updatedAt: currentIso()
    });
    await storage.appendEvidence(makeEvidence({
      profileId,
      activityId: activity.activityId,
      techniqueId: activity.focusTechniqueId,
      eventType: "activity_offered",
      payload: {
        activityType: activity.activityType,
        reasonCodes: [...activity.recommendationSnapshot.reasonCodes]
      }
    }));
    model = await loadModel(profileId);
    return { ...model, selection };
  }

  async function startCurrentActivity(profileId = "local") {
    const model = await loadModel(profileId);
    const activity = model.currentActivity;
    if (!activity) throw new Error("There is no current campaign activity.");
    if (activity.startedAt) return model;
    const timestamp = currentIso();
    await storage.putActivity({ ...activity, startedAt: timestamp });
    await storage.appendEvidence(makeEvidence({
      profileId,
      activityId: activity.activityId,
      techniqueId: activity.focusTechniqueId,
      eventType: "activity_started",
      occurredAt: timestamp,
      payload: { activityType: activity.activityType }
    }));
    if (activity.observationPlacement) {
      await storage.appendEvidence(makeEvidence({
        profileId,
        activityId: activity.activityId,
        techniqueId: activity.focusTechniqueId,
        eventType: "placement_check_started",
        occurredAt: timestamp,
        payload: {
          source: "observed",
          activityType: activity.activityType,
          inferencePolicyVersion: CAMPAIGN_INFERENCE_POLICY_VERSION
        }
      }));
    }
    return loadModel(profileId);
  }

  async function recordAssistance(level, profileId = "local") {
    const eventType = ({
      tool: "tool_used",
      "search-focus": "search_focus_revealed",
      "structural-location": "structural_location_revealed",
      "exact-move": "exact_move_revealed"
    })[level];
    if (!eventType) return loadModel(profileId);
    const model = await loadModel(profileId);
    if (!model.currentActivity) return model;
    const alreadyRecorded = model.evidence.some((item) => (
      item.activityId === model.currentActivity.activityId && item.eventType === eventType
    ));
    if (!alreadyRecorded) {
      await storage.appendEvidence(makeEvidence({
        profileId,
        activityId: model.currentActivity.activityId,
        techniqueId: model.currentActivity.focusTechniqueId,
        eventType,
        assistanceLevel: level
      }));
    }
    return loadModel(profileId);
  }

  async function completeCurrentActivity({
    recognized = false,
    incorrect = false,
    guessed = false,
    profileId = "local"
  } = {}) {
    const model = await loadModel(profileId);
    const activity = model.currentActivity;
    if (!activity) throw new Error("There is no current campaign activity to complete.");
    const timestamp = currentIso();
    const activityEvidence = model.evidence.filter((item) => item.activityId === activity.activityId);
    const assistanceLevel = deepestAssistanceLevel(activityEvidence.map((item) => item.assistanceLevel));
    const finalEvents = [];
    const placementSuccess = (
      activity.placementCheck &&
      recognized &&
      !guessed &&
      assistanceRank(assistanceLevel) < assistanceRank("structural-location")
    );
    if (recognized) {
      finalEvents.push(makeEvidence({
        profileId,
        activityId: activity.activityId,
        techniqueId: activity.focusTechniqueId,
        eventType: "target_recognized",
        assistanceLevel,
        puzzleStateFingerprint: createPuzzleStateFingerprint({
          sourceId: `${activity.sourceId}:${activity.fixtureIndex ?? 0}`,
          replayIndex: 0,
          techniqueId: activity.focusTechniqueId,
          certificationVersion: activity.certificationSnapshot.certificationVersion
        }),
        occurredAt: timestamp,
        payload: { recognitionKind: activity.placementCheck ? "placement" : "campaign" }
      }));
    }
    if (incorrect) {
      finalEvents.push(makeEvidence({
        profileId,
        activityId: activity.activityId,
        techniqueId: activity.focusTechniqueId,
        eventType: "focus_action_incorrect",
        assistanceLevel,
        occurredAt: timestamp
      }));
    }
    if (guessed) {
      finalEvents.push(makeEvidence({
        profileId,
        activityId: activity.activityId,
        techniqueId: activity.focusTechniqueId,
        eventType: "learner_reported_guess",
        assistanceLevel,
        occurredAt: timestamp
      }));
    }
    if (activity.placementCheck) {
      finalEvents.push(makeEvidence({
        profileId,
        activityId: activity.activityId,
        techniqueId: activity.focusTechniqueId,
        eventType: "placement_check_completed",
        assistanceLevel,
        occurredAt: timestamp,
        payload: {
          result: placementSuccess ? "success" : "needs-practice",
          source: activity.observationPlacement ? "observed" : "learner-selected"
        }
      }));
    }
    finalEvents.push(makeEvidence({
      profileId,
      activityId: activity.activityId,
      techniqueId: activity.focusTechniqueId,
      eventType: "activity_completed",
      assistanceLevel,
      occurredAt: timestamp,
      payload: { activityType: activity.activityType }
    }));
    await storage.completeActivity({
      activityId: activity.activityId,
      profileId,
      evidenceEvents: finalEvents,
      completedAt: timestamp
    });
    const completedModel = await loadModel(profileId);
    if (activity.observationPlacement) {
      const nextTechniqueId = placementSuccess
        ? nextObservedTechniqueId(completedModel.activities)
        : null;
      await saveObservedProfileInference({
        model: completedModel,
        placementCompleted: !nextTechniqueId,
        timestamp
      });
      const continuedModel = nextTechniqueId
        ? await offerObservedPlacement({
            profileId,
            campaignState: completedModel.campaignState,
            techniqueId: nextTechniqueId,
            timestamp
          })
        : await ensureRecommendation(profileId);
      return {
        ...continuedModel,
        reflection: {
          completedActivity: activity,
          assistanceLevel,
          recognized,
          guessed,
          observedPlacement: true,
          previousSkill: model.skills.find((skill) => skill.techniqueId === activity.focusTechniqueId),
          nextSkill: continuedModel.skills.find((skill) => skill.techniqueId === activity.focusTechniqueId)
        }
      };
    }
    if (activity.placementCheck) return completedModel;
    const continuedModel = await ensureRecommendation(profileId);
    return {
      ...continuedModel,
      reflection: {
        completedActivity: activity,
        assistanceLevel,
        recognized,
        guessed,
        previousSkill: model.skills.find((skill) => skill.techniqueId === activity.focusTechniqueId),
        nextSkill: continuedModel.skills.find((skill) => skill.techniqueId === activity.focusTechniqueId)
      }
    };
  }

  async function correctSkill(techniqueId, status, profileId = "local") {
    assertTechnique(techniqueId);
    await storage.appendEvidence(makeEvidence({
      profileId,
      techniqueId,
      eventType: "profile_corrected",
      occurredAt: currentIso(),
      payload: { status: normalizePlacementStatus(status), source: "skill-graph" }
    }));
    return loadModel(profileId);
  }

  async function correctGoal(goal, profileId = "local") {
    if (!["learn-techniques", "solve-more-puzzles", "build-confidence"].includes(goal)) {
      throw new Error("Choose a supported campaign goal.");
    }
    const timestamp = currentIso();
    await storage.appendEvidence(makeEvidence({
      profileId,
      eventType: "profile_corrected",
      occurredAt: timestamp,
      payload: { goal, source: "campaign-home" }
    }));
    return loadModel(profileId);
  }

  return Object.freeze({
    loadModel,
    savePlacement,
    beginPlacementCheck,
    beginObservedPlacement,
    ensureRecommendation,
    startCurrentActivity,
    recordAssistance,
    completeCurrentActivity,
    correctSkill,
    correctGoal,
    exportData: () => storage.exportData(),
    resetProgress: async (profileId = "local") => {
      await storage.resetProgress(profileId);
      return loadModel(profileId);
    },
    deleteData: async () => {
      await storage.deleteProfileData();
      return loadModel("local");
    }
  });

  function makeEvidence(input) {
    return createEvidenceEvent(input, { now: currentDate(), eventId: eventId() });
  }

  function currentDate() {
    const value = now();
    return value instanceof Date ? value : new Date(value);
  }

  function currentIso() {
    return currentDate().toISOString();
  }

  function inputVersions() {
    return {
      graphVersion: graph.version,
      masteryPolicyVersion: DEFAULT_MASTERY_POLICY.version,
      selectorPolicyVersion: DEFAULT_SELECTOR_POLICY.version,
      activityIndexVersion: activityIndex.version,
      researchPriorVersion: researchPrior.version,
      inferencePolicyVersion: CAMPAIGN_INFERENCE_POLICY_VERSION
    };
  }

  async function ensureCampaignState(profileId) {
    const existing = await storage.getCampaignState(profileId);
    if (existing) return existing;
    const created = defaultCampaignState(profileId, currentIso());
    await storage.putCampaignState(created);
    return created;
  }

  function firstObservedTechniqueId() {
    return observedTechniqueIds()[0];
  }

  function nextObservedTechniqueId(activities) {
    const completed = new Set(activities
      .filter((activity) => activity.observationPlacement && activity.completedAt)
      .map((activity) => activity.focusTechniqueId));
    return observedTechniqueIds().find((techniqueId) => !completed.has(techniqueId)) || null;
  }

  function observedTechniqueIds() {
    return graph.nodes
      .filter((node) => node.kind === "technique" && node.tier === 1)
      .sort((left, right) => left.order - right.order)
      .slice(0, 3)
      .map((node) => node.id);
  }

  function createPlacementActivity({
    profileId,
    campaignState,
    techniqueId,
    source,
    activityType,
    timestamp,
    observationPlacement = false,
    started = true,
    profile = null
  }) {
    return {
      activityId: `${observationPlacement ? "observed" : "placement"}-${profileId}-${campaignState.campaignSequence}-${techniqueId}`,
      profileId,
      activityType,
      focusTechniqueId: techniqueId,
      sourceKind: "practice",
      sourceId: source.sourceId,
      canonicalPuzzleId: null,
      estimatedMinutes: source.estimatedMinutes,
      fixtureIndex: campaignState.campaignSequence % 10,
      createdAt: timestamp,
      startedAt: started ? timestamp : null,
      targetReachedAt: null,
      completedAt: null,
      replacedAt: null,
      abandonedAt: null,
      replacementActivityId: null,
      placementCheck: true,
      observationPlacement,
      recommendationSnapshot: {
        reasonCodes: [observationPlacement ? "OBSERVED_PLACEMENT" : "PLACEMENT_RECOGNITION_CHECK"],
        inputVersions: inputVersions(),
        profileSnapshot: profile ? {
          goal: profile.goal,
          goalSource: profile.goalSource,
          preferredMinutes: profile.preferredMinutes,
          preferredMinutesSource: profile.preferredMinutesSource,
          inferencePolicyVersion: profile.inferencePolicyVersion
        } : null
      },
      certificationSnapshot: {
        activityIndexVersion: activityIndex.version,
        certificationVersion: source.certificationVersion,
        noveltyBudget: 1,
        allowedTechniqueIds: [...source.allowedTechniqueIds]
      },
      lifecycleVersion: 1
    };
  }

  async function offerObservedPlacement({
    profileId,
    campaignState,
    techniqueId,
    timestamp
  }) {
    const model = await loadModel(profileId);
    const masteredTechniqueIds = model.skills
      .filter((skill) => ["mastered", "review-due"].includes(skill.state))
      .map((skill) => skill.techniqueId);
    const source = queryCampaignActivities(activityIndex, {
      focusTechniqueId: techniqueId,
      masteredTechniqueIds,
      activityTypes: ["find-pattern"]
    })[0];
    if (!source) throw new Error(`No certified starting-point puzzle is available for ${techniqueNameForId(techniqueId, graph)}.`);
    const activity = createPlacementActivity({
      profileId,
      campaignState,
      techniqueId,
      source,
      activityType: "find-pattern",
      timestamp,
      observationPlacement: true,
      started: false,
      profile: model.profile
    });
    await storage.putActivity(activity);
    await storage.putCampaignState({
      ...campaignState,
      currentActivityId: activity.activityId,
      updatedAt: timestamp
    });
    await storage.appendEvidence(makeEvidence({
      profileId,
      activityId: activity.activityId,
      techniqueId,
      eventType: "activity_offered",
      occurredAt: timestamp,
      payload: {
        activityType: activity.activityType,
        reasonCodes: ["OBSERVED_PLACEMENT"]
      }
    }));
    return loadModel(profileId);
  }

  async function saveObservedProfileInference({
    model,
    placementCompleted,
    timestamp
  }) {
    const profile = await storage.getProfile(model.profile.id);
    const observedActivityIds = new Set(model.activities
      .filter((activity) => activity.observationPlacement)
      .map((activity) => activity.activityId));
    const observedEvidence = model.evidence.filter((event) => observedActivityIds.has(event.activityId));
    const inferredGoal = inferGoal(observedEvidence);
    await storage.putProfile(normalizeProfile({
      ...profile,
      goal: profile.goalSource === "learner" ? profile.goal : inferredGoal,
      goalSource: profile.goalSource === "learner" ? "learner" : "observed",
      placementCompletedAt: placementCompleted ? timestamp : null,
      placementMethod: "observed",
      goalInference: profile.goalSource === "learner" ? null : {
        policyVersion: CAMPAIGN_INFERENCE_POLICY_VERSION,
        evidenceEventIds: observedEvidence.map((event) => event.eventId),
        confidence: "low"
      },
      updatedAt: timestamp
    }, timestamp));
  }

  function assertTechnique(techniqueId) {
    if (!graph.nodes.some((node) => node.kind === "technique" && node.id === techniqueId)) {
      throw new Error(`Unknown campaign technique: ${techniqueId}`);
    }
  }
}

function normalizeProfile(profile, timestamp) {
  const normalizedGoal = ["learn-techniques", "solve-more-puzzles", "build-confidence"].includes(profile.goal)
    ? profile.goal
    : null;
  return {
    id: profile.id || "local",
    schemaVersion: CAMPAIGN_PROFILE_SCHEMA_VERSION,
    createdAt: profile.createdAt || timestamp,
    updatedAt: timestamp,
    goal: normalizedGoal,
    goalSource: ["learner", "observed", "observing"].includes(profile.goalSource)
      ? profile.goalSource
      : normalizedGoal ? "learner" : "observing",
    goalInference: profile.goalInference || null,
    preferredMinutes: [5, 10, 15, 25].includes(Number(profile.preferredMinutes))
      ? Number(profile.preferredMinutes)
      : 10,
    preferredMinutesSource: ["learner", "default"].includes(profile.preferredMinutesSource)
      ? profile.preferredMinutesSource
      : "default",
    preferredDifficulty: profile.preferredDifficulty || null,
    automationTechniqueIds: Array.isArray(profile.automationTechniqueIds) ? profile.automationTechniqueIds : [],
    avoidedTechniqueIds: Array.isArray(profile.avoidedTechniqueIds) ? profile.avoidedTechniqueIds : [],
    placementCompletedAt: profile.placementCompletedAt || null,
    placementSkippedAt: profile.placementSkippedAt || null,
    placementMethod: ["observed", "self-report", "skipped"].includes(profile.placementMethod)
      ? profile.placementMethod
      : null,
    placementDraftReports: normalizeReports(profile.placementDraftReports || {}),
    masteryPolicyVersion: DEFAULT_MASTERY_POLICY.version,
    selectorPolicyVersion: DEFAULT_SELECTOR_POLICY.version,
    inferencePolicyVersion: CAMPAIGN_INFERENCE_POLICY_VERSION
  };
}

function applyProfileEvidence(profile, evidenceEvents) {
  if (!profile) return null;
  const correction = [...evidenceEvents]
    .filter((event) => (
      event.eventType === "profile_corrected" &&
      event.techniqueId === null &&
      ["learn-techniques", "solve-more-puzzles", "build-confidence"].includes(event.payload?.goal)
    ))
    .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt) || left.eventId.localeCompare(right.eventId))
    .at(-1);
  if (!correction) return profile;
  return {
    ...profile,
    goal: correction.payload.goal,
    goalSource: "learner",
    goalInference: null
  };
}

function normalizeReports(reports) {
  return Object.fromEntries(Object.entries(reports || {}).map(([techniqueId, status]) => [
    techniqueId,
    normalizePlacementStatus(status)
  ]));
}

function normalizePlacementStatus(status) {
  if (status === "know-it" || status === "known") return "known";
  if (status === "learning") return "learning";
  return "unknown";
}

function defaultCampaignState(profileId, timestamp) {
  return {
    profileId,
    currentActivityId: null,
    lastCompletedActivityId: null,
    campaignSequence: 0,
    updatedAt: timestamp
  };
}

function summarizeSkills(skills) {
  const summary = { unseen: 0, learning: 0, practicing: 0, mastered: 0, "review-due": 0 };
  for (const skill of skills) summary[skill.state] = (summary[skill.state] || 0) + 1;
  return summary;
}

function assistanceRank(level) {
  return ["none", "tool", "search-focus", "structural-location", "exact-move"].indexOf(level);
}

function inferGoal(evidenceEvents) {
  const observedResults = evidenceEvents
    .filter((event) => event.eventType === "placement_check_completed")
    .map((event) => event.payload?.result);
  if (observedResults.includes("needs-practice")) return "build-confidence";
  const recognitions = evidenceEvents.filter((event) => event.eventType === "target_recognized");
  if (recognitions.length && recognitions.every((event) => assistanceRank(event.assistanceLevel) <= assistanceRank("tool"))) {
    return "solve-more-puzzles";
  }
  if (recognitions.length) return "learn-techniques";
  return "learn-techniques";
}
