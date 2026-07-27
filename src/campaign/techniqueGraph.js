import {
  COACHING_TIER_1,
  COACHING_TIER_2,
  COMMITTED_COACHING_TECHNIQUES,
  PROVISIONAL_TECHNIQUES
} from "../puzzles.js";

export const CAMPAIGN_GRAPH_VERSION = 1;

const TECHNIQUE_IDS = Object.freeze({
  "Last Digit": "last-digit",
  "Naked Single": "naked-single",
  "Hidden Single": "hidden-single",
  "Pointing Candidates": "pointing-candidates",
  "Claiming Candidates": "claiming-candidates",
  "Naked Pair": "naked-pair",
  "Hidden Pair": "hidden-pair",
  "Naked Triple": "naked-triple",
  "Hidden Triple": "hidden-triple",
  "Naked Quadruple": "naked-quadruple",
  "X-Wing": "x-wing",
  Swordfish: "swordfish",
  Skyscraper: "skyscraper",
  "2-String Kite": "two-string-kite",
  "XY-Wing": "xy-wing",
  "XYZ-Wing": "xyz-wing",
  "W-Wing": "w-wing"
});

const PREREQUISITES = Object.freeze({
  "last-digit": [],
  "naked-single": [],
  "hidden-single": [],
  "pointing-candidates": ["hidden-single"],
  "claiming-candidates": ["pointing-candidates"],
  "naked-pair": ["naked-single", "hidden-single"],
  "hidden-pair": ["naked-pair"],
  "naked-triple": ["naked-pair"],
  "hidden-triple": ["hidden-pair", "naked-triple"],
  "naked-quadruple": ["naked-triple"],
  "x-wing": ["claiming-candidates", "hidden-pair"],
  swordfish: ["x-wing"],
  skyscraper: ["claiming-candidates", "hidden-pair"],
  "two-string-kite": ["claiming-candidates", "hidden-pair"],
  "xy-wing": ["naked-pair", "hidden-pair"],
  "xyz-wing": ["xy-wing"],
  "w-wing": ["claiming-candidates", "hidden-pair"]
});

const FAMILY_EDGES = Object.freeze([
  ["naked-pair", "naked-triple"],
  ["naked-triple", "naked-quadruple"],
  ["hidden-pair", "hidden-triple"],
  ["x-wing", "swordfish"],
  ["skyscraper", "two-string-kite"],
  ["xy-wing", "xyz-wing"],
  ["xy-wing", "w-wing"]
]);

const TOOL_SUPPORT = Object.freeze({
  "hidden-single": ["unit-candidate-counts"],
  "pointing-candidates": ["box-line-spotlight"],
  "claiming-candidates": ["box-line-spotlight"],
  "naked-pair": ["bivalue-filter", "matching-candidate-set"],
  "hidden-pair": ["unit-candidate-counts"],
  "naked-triple": ["bivalue-filter"],
  "x-wing": ["unit-candidate-counts", "fish-footprint"],
  swordfish: ["unit-candidate-counts", "fish-footprint"],
  skyscraper: ["strong-link-overlay", "shared-visibility"],
  "two-string-kite": ["strong-link-overlay", "box-line-spotlight"],
  "xy-wing": ["bivalue-filter", "shared-visibility"],
  "xyz-wing": ["bivalue-filter", "shared-visibility"],
  "w-wing": ["bivalue-filter", "matching-candidate-set", "strong-link-overlay", "shared-visibility"]
});

const COVERAGE_OVERLAP = Object.freeze([
  ["skyscraper", "two-string-kite"],
  ["x-wing", "swordfish"]
]);

export const CAMPAIGN_TECHNIQUE_GRAPH = Object.freeze(buildTechniqueGraph());

export function techniqueIdForName(name) {
  return TECHNIQUE_IDS[name] || null;
}

export function techniqueNameForId(id, graph = CAMPAIGN_TECHNIQUE_GRAPH) {
  return graph.nodes.find((node) => node.id === id)?.catalogName || null;
}

export function techniqueNode(id, graph = CAMPAIGN_TECHNIQUE_GRAPH) {
  return graph.nodes.find((node) => node.id === id) || null;
}

export function techniquePrerequisites(id, graph = CAMPAIGN_TECHNIQUE_GRAPH) {
  return graph.edges
    .filter((edge) => edge.type === "prerequisite" && edge.to === id)
    .map((edge) => edge.from);
}

export function prerequisitesReady(id, skillStates, {
  graph = CAMPAIGN_TECHNIQUE_GRAPH,
  readyStates = ["practicing", "mastered", "review-due"]
} = {}) {
  const states = normalizeSkillStates(skillStates);
  return techniquePrerequisites(id, graph).every((prerequisiteId) => (
    readyStates.includes(states.get(prerequisiteId)?.state)
  ));
}

export function validateTechniqueGraph(graph = CAMPAIGN_TECHNIQUE_GRAPH) {
  if (graph.version !== CAMPAIGN_GRAPH_VERSION) throw new Error("Campaign technique graph version is unsupported.");
  const techniqueNodes = graph.nodes.filter((node) => node.kind === "technique");
  const ids = techniqueNodes.map((node) => node.id);
  const names = techniqueNodes.map((node) => node.catalogName);
  if (new Set(ids).size !== ids.length) throw new Error("Campaign technique IDs must be unique.");
  if (new Set(names).size !== names.length) throw new Error("Campaign technique names must be unique.");
  if (names.length !== COMMITTED_COACHING_TECHNIQUES.length) throw new Error("Campaign graph must exactly cover the committed coaching catalog.");
  for (const name of COMMITTED_COACHING_TECHNIQUES) {
    if (!names.includes(name)) throw new Error(`Campaign graph is missing ${name}.`);
  }
  for (const name of PROVISIONAL_TECHNIQUES) {
    if (names.includes(name)) throw new Error(`Provisional technique ${name} cannot enter the campaign graph.`);
  }

  const allNodeIds = new Set(graph.nodes.map((node) => node.id));
  for (const edge of graph.edges) {
    if (!allNodeIds.has(edge.from) || !allNodeIds.has(edge.to)) throw new Error(`Campaign edge references an unknown node: ${edge.from} -> ${edge.to}.`);
  }
  assertAcyclicPrerequisites(graph);
  assertFoundationPaths(graph);
  return true;
}

function buildTechniqueGraph() {
  const nodes = COMMITTED_COACHING_TECHNIQUES.map((catalogName, order) => ({
    id: TECHNIQUE_IDS[catalogName],
    kind: "technique",
    catalogName,
    catalogVersion: 1,
    graphVersion: CAMPAIGN_GRAPH_VERSION,
    tier: COACHING_TIER_1.includes(catalogName) ? 1 : COACHING_TIER_2.includes(catalogName) ? 2 : null,
    order,
    committed: true
  }));
  const toolIds = new Set(Object.values(TOOL_SUPPORT).flat());
  for (const id of toolIds) {
    nodes.push({
      id,
      kind: "tool",
      graphVersion: CAMPAIGN_GRAPH_VERSION,
      committed: false
    });
  }

  const edges = [];
  for (const [to, prerequisites] of Object.entries(PREREQUISITES)) {
    for (const from of prerequisites) edges.push(edge(from, to, "prerequisite"));
  }
  for (const [from, to] of FAMILY_EDGES) edges.push(edge(from, to, "family"));
  for (const [to, tools] of Object.entries(TOOL_SUPPORT)) {
    for (const from of tools) edges.push(edge(from, to, "tool-support"));
  }
  for (const [from, to] of COVERAGE_OVERLAP) {
    edges.push(edge(from, to, "coverage-overlap"));
    edges.push(edge(to, from, "coverage-overlap"));
  }
  return { version: CAMPAIGN_GRAPH_VERSION, nodes: Object.freeze(nodes), edges: Object.freeze(edges) };
}

function edge(from, to, type) {
  return Object.freeze({ from, to, type, version: CAMPAIGN_GRAPH_VERSION });
}

function normalizeSkillStates(skillStates) {
  if (skillStates instanceof Map) return skillStates;
  if (Array.isArray(skillStates)) return new Map(skillStates.map((item) => [item.techniqueId, item]));
  return new Map(Object.entries(skillStates || {}));
}

function assertAcyclicPrerequisites(graph) {
  const outgoing = new Map();
  for (const edgeItem of graph.edges.filter((item) => item.type === "prerequisite")) {
    if (!outgoing.has(edgeItem.from)) outgoing.set(edgeItem.from, []);
    outgoing.get(edgeItem.from).push(edgeItem.to);
  }
  const visiting = new Set();
  const visited = new Set();
  const visit = (id) => {
    if (visiting.has(id)) throw new Error(`Campaign prerequisite cycle includes ${id}.`);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const next of outgoing.get(id) || []) visit(next);
    visiting.delete(id);
    visited.add(id);
  };
  for (const node of graph.nodes.filter((item) => item.kind === "technique")) visit(node.id);
}

function assertFoundationPaths(graph) {
  const techniques = graph.nodes.filter((node) => node.kind === "technique");
  const prerequisiteMap = new Map(techniques.map((node) => [node.id, techniquePrerequisites(node.id, graph)]));
  const foundations = new Set([...prerequisiteMap].filter(([, prerequisites]) => !prerequisites.length).map(([id]) => id));
  if (!foundations.size) throw new Error("Campaign graph needs at least one foundation technique.");
  const reachesFoundation = (id, visited = new Set()) => {
    if (foundations.has(id)) return true;
    if (visited.has(id)) return false;
    visited.add(id);
    return (prerequisiteMap.get(id) || []).some((prerequisiteId) => reachesFoundation(prerequisiteId, visited));
  };
  for (const technique of techniques) {
    if (!reachesFoundation(technique.id)) throw new Error(`${technique.id} has no path from an eligible foundation.`);
  }
}
