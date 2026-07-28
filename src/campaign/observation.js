export const CAMPAIGN_OBSERVATION_POLICY_VERSION = 1;

export function createObservationReplayToken({ values = [], eliminated = [] } = {}) {
  if (!Array.isArray(values) || values.length !== 81) {
    throw new Error("An observation replay token requires 81 cell values.");
  }
  const logicalState = values.map((value, index) => {
    const exclusions = [...(eliminated[index] || [])].sort((left, right) => left - right).join("");
    return `${Number(value) || 0}:${exclusions}`;
  }).join("|");
  return `logical-state-v1-${fnv1a(logicalState)}`;
}

export function uniquelyAttributeFill({
  moves = [],
  allowedTechniqueNames = [],
  index,
  digit
} = {}) {
  const allowed = new Set(allowedTechniqueNames);
  const techniques = new Set(
    moves
      .filter((move) => allowed.has(move.technique))
      .filter((move) => (move.fills || []).some((fill) => fill.index === index && fill.digit === digit))
      .map((move) => move.technique)
  );
  return techniques.size === 1 ? [...techniques][0] : null;
}

function fnv1a(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
