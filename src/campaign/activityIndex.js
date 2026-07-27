import { CERTIFIED_PUZZLES } from "../puzzleCatalog.js";
import { PRACTICE_MODES } from "../practice.js";
import {
  CAMPAIGN_TECHNIQUE_GRAPH,
  techniqueIdForName,
  validateTechniqueGraph
} from "./techniqueGraph.js";

export const CAMPAIGN_ACTIVITY_INDEX_VERSION = 1;
export const CAMPAIGN_CERTIFICATION_VERSION = 1;

export function buildCampaignActivityIndex({
  catalogPuzzles = CERTIFIED_PUZZLES,
  graph = CAMPAIGN_TECHNIQUE_GRAPH
} = {}) {
  validateTechniqueGraph(graph);
  const records = [];
  const techniques = graph.nodes.filter((node) => node.kind === "technique");

  for (const node of techniques) {
    records.push(createLessonRecord(node));
    for (const mode of PRACTICE_MODES) records.push(createPracticeRecord(node, mode.id));
  }

  for (const puzzle of catalogPuzzles) {
    const allowedTechniqueIds = puzzle.techniques.map(techniqueIdForName);
    if (allowedTechniqueIds.some((id) => !id)) continue;
    for (const techniqueName of puzzle.required) {
      const techniqueId = techniqueIdForName(techniqueName);
      if (!techniqueId) continue;
      records.push(Object.freeze({
        sourceId: puzzle.id,
        sourceKind: "catalog",
        activityType: "full-puzzle",
        canonicalPuzzleId: puzzle.id,
        focusTechniqueId: techniqueId,
        difficulty: puzzle.level,
        estimatedMinutes: estimatePuzzleMinutes(puzzle.steps),
        solverVersion: 1,
        certificationVersion: CAMPAIGN_CERTIFICATION_VERSION,
        noveltyCertified: true,
        runtimeLaunchCertified: false,
        allowedTechniqueIds: Object.freeze([...new Set(allowedTechniqueIds)]),
        requiredTechniqueIds: Object.freeze(puzzle.required.map(techniqueIdForName).filter(Boolean)),
        focusWindows: Object.freeze([Object.freeze({
          techniqueId,
          replayIndex: null,
          masteredStepsBefore: null,
          remainingSteps: puzzle.steps,
          actionFingerprint: null
        })]),
        provenance: puzzle.provenance
      }));
    }
  }

  const index = Object.freeze({
    version: CAMPAIGN_ACTIVITY_INDEX_VERSION,
    graphVersion: graph.version,
    certificationVersion: CAMPAIGN_CERTIFICATION_VERSION,
    records: Object.freeze(records)
  });
  validateCampaignActivityIndex(index, graph);
  return index;
}

export function queryCampaignActivities(index, {
  focusTechniqueId,
  masteredTechniqueIds = [],
  activityTypes = null,
  recentCanonicalPuzzleIds = []
}) {
  const mastered = new Set(masteredTechniqueIds);
  const allowed = new Set([...mastered, focusTechniqueId]);
  const recent = new Set(recentCanonicalPuzzleIds);
  return index.records.filter((record) => (
    record.focusTechniqueId === focusTechniqueId &&
    (!activityTypes || activityTypes.includes(record.activityType)) &&
    (!record.canonicalPuzzleId || !recent.has(record.canonicalPuzzleId)) &&
    record.noveltyCertified &&
    (!["full-puzzle", "focused-puzzle", "complete-puzzle"].includes(record.activityType) || record.runtimeLaunchCertified) &&
    record.allowedTechniqueIds.every((id) => allowed.has(id))
  ));
}

export function validateCampaignActivityIndex(index, graph = CAMPAIGN_TECHNIQUE_GRAPH) {
  if (index.version !== CAMPAIGN_ACTIVITY_INDEX_VERSION) throw new Error("Unsupported campaign activity index.");
  if (index.graphVersion !== graph.version) throw new Error("Campaign activity index graph version mismatch.");
  const committed = new Set(graph.nodes.filter((node) => node.kind === "technique").map((node) => node.id));
  const sourceKeys = new Set();
  for (const record of index.records) {
    if (!committed.has(record.focusTechniqueId)) throw new Error(`Activity index has an uncommitted focus: ${record.focusTechniqueId}`);
    if (record.allowedTechniqueIds.some((id) => !committed.has(id))) throw new Error(`Activity index has an uncommitted allowed technique: ${record.sourceId}`);
    if (!record.sourceId || !record.activityType) throw new Error("Activity index records need source and activity type.");
    const key = `${record.sourceKind}:${record.sourceId}:${record.focusTechniqueId}:${record.activityType}`;
    if (sourceKeys.has(key)) throw new Error(`Duplicate activity index record: ${key}`);
    sourceKeys.add(key);
  }
  return true;
}

function createLessonRecord(node) {
  return Object.freeze({
    sourceId: `lesson:${node.id}`,
    sourceKind: "lesson",
    activityType: "lesson",
    canonicalPuzzleId: null,
    focusTechniqueId: node.id,
    difficulty: `tier-${node.tier}`,
    estimatedMinutes: 5,
    solverVersion: null,
    certificationVersion: CAMPAIGN_CERTIFICATION_VERSION,
    noveltyCertified: true,
    runtimeLaunchCertified: true,
    allowedTechniqueIds: Object.freeze([node.id]),
    requiredTechniqueIds: Object.freeze([node.id]),
    focusWindows: Object.freeze([])
  });
}

function createPracticeRecord(node, mode) {
  const completePuzzle = mode === "complete-puzzle";
  return Object.freeze({
    sourceId: `practice:${node.id}:${mode}`,
    sourceKind: "practice",
    activityType: mode,
    canonicalPuzzleId: null,
    focusTechniqueId: node.id,
    difficulty: `tier-${node.tier}`,
    estimatedMinutes: mode === "find-pattern" ? 3 : mode === "near-miss" ? 4 : 12,
    solverVersion: 1,
    certificationVersion: CAMPAIGN_CERTIFICATION_VERSION,
    noveltyCertified: !completePuzzle,
    runtimeLaunchCertified: !completePuzzle,
    allowedTechniqueIds: Object.freeze([node.id]),
    requiredTechniqueIds: Object.freeze([node.id]),
    focusWindows: Object.freeze([Object.freeze({
      techniqueId: node.id,
      replayIndex: 0,
      masteredStepsBefore: 0,
      remainingSteps: completePuzzle ? null : 1,
      actionFingerprint: null
    })])
  });
}

function estimatePuzzleMinutes(steps) {
  return Math.max(8, Math.min(30, Math.ceil((steps || 30) * 0.45)));
}
