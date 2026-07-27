export const CAMPAIGN_EVIDENCE_VERSION = 1;

export const CAMPAIGN_EVENT_TYPES = Object.freeze([
  "placement_self_reported",
  "placement_check_started",
  "placement_check_completed",
  "activity_offered",
  "activity_started",
  "tool_used",
  "search_focus_revealed",
  "structural_location_revealed",
  "exact_move_revealed",
  "target_recognized",
  "focus_action_incorrect",
  "learner_reported_guess",
  "activity_completed",
  "activity_abandoned",
  "activity_replaced",
  "profile_corrected",
  "mastery_automation_enabled",
  "mastery_automation_disabled"
]);

export const ASSISTANCE_LEVELS = Object.freeze([
  "none",
  "tool",
  "search-focus",
  "structural-location",
  "exact-move"
]);

const FORBIDDEN_PAYLOAD_KEYS = /(grid|solution|candidate|notes?|exact.?move|move)/i;

export function createEvidenceEvent(input, {
  now = new Date(),
  eventId = null
} = {}) {
  const occurredAt = toIso(input.occurredAt || now);
  const event = {
    eventId: eventId || input.eventId || createEventId(input, occurredAt),
    profileId: input.profileId || "local",
    activityId: input.activityId || null,
    techniqueId: input.techniqueId || null,
    eventType: input.eventType,
    assistanceLevel: input.assistanceLevel || "none",
    puzzleStateFingerprint: input.puzzleStateFingerprint || null,
    canonicalPuzzleId: input.canonicalPuzzleId || null,
    occurredAt,
    localDate: input.localDate || occurredAt.slice(0, 10),
    payloadVersion: CAMPAIGN_EVIDENCE_VERSION,
    payload: clone(input.payload || {})
  };
  validateEvidenceEvent(event);
  return Object.freeze(event);
}

export function validateEvidenceEvent(event) {
  if (!event || typeof event !== "object") throw new Error("Campaign evidence must be an object.");
  if (!event.eventId || !event.profileId) throw new Error("Campaign evidence requires eventId and profileId.");
  if (!CAMPAIGN_EVENT_TYPES.includes(event.eventType)) throw new Error(`Unknown campaign event type: ${event.eventType}`);
  if (!ASSISTANCE_LEVELS.includes(event.assistanceLevel)) throw new Error(`Unknown assistance level: ${event.assistanceLevel}`);
  if (event.payloadVersion !== CAMPAIGN_EVIDENCE_VERSION) throw new Error("Unsupported campaign evidence payload version.");
  toIso(event.occurredAt);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(event.localDate)) throw new Error("Campaign evidence localDate must be YYYY-MM-DD.");
  assertPrivatePayload(event.payload);
  return true;
}

export function createPuzzleStateFingerprint({
  sourceId,
  replayIndex,
  techniqueId,
  certificationVersion
}) {
  if (!sourceId || !techniqueId || certificationVersion === undefined) {
    throw new Error("A state fingerprint requires sourceId, techniqueId, and certificationVersion.");
  }
  const value = [sourceId, replayIndex ?? "start", techniqueId, certificationVersion].join("|");
  return `state-v1-${fnv1a(value)}`;
}

export function deepestAssistanceLevel(levels) {
  return [...levels].reduce((deepest, level) => {
    if (!ASSISTANCE_LEVELS.includes(level)) throw new Error(`Unknown assistance level: ${level}`);
    return ASSISTANCE_LEVELS.indexOf(level) > ASSISTANCE_LEVELS.indexOf(deepest) ? level : deepest;
  }, "none");
}

function assertPrivatePayload(value, path = "payload") {
  if (value === null || value === undefined) return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertPrivatePayload(item, `${path}[${index}]`));
    return;
  }
  if (typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_PAYLOAD_KEYS.test(key)) {
      throw new Error(`Campaign evidence cannot store puzzle state at ${path}.${key}.`);
    }
    assertPrivatePayload(child, `${path}.${key}`);
  }
}

function createEventId(input, occurredAt) {
  const seed = [
    input.profileId || "local",
    input.activityId || "",
    input.techniqueId || "",
    input.eventType || "",
    occurredAt,
    JSON.stringify(input.payload || {})
  ].join("|");
  return `evidence-${fnv1a(seed)}`;
}

function fnv1a(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function toIso(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Campaign evidence occurredAt must be a valid date.");
  return date.toISOString();
}

function clone(value) {
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}
