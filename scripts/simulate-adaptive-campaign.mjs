import {
  buildCampaignActivityIndex,
  CAMPAIGN_TECHNIQUE_GRAPH,
  formatSelectorTrace,
  selectNextActivity
} from "../src/campaign/index.js";

const activityIndex = buildCampaignActivityIndex();
const techniqueNodes = CAMPAIGN_TECHNIQUE_GRAPH.nodes.filter((node) => node.kind === "technique");
const researchPrior = {
  version: "simulation-prior-v1",
  sourceStudyCommit: "simulation-only-not-for-production",
  values: {
    "w-wing": 1,
    skyscraper: 0.6,
    "two-string-kite": 0.5,
    "xy-wing": 0.4
  },
  limitations: "Synthetic completion-coverage weights for deterministic developer simulation only."
};

const scenarios = [
  {
    name: "New learner",
    profile: {
      id: "simulation-new",
      goal: "learn-techniques",
      preferredMinutes: 15,
      avoidedTechniqueIds: []
    },
    skills: []
  },
  {
    name: "Tier 1 master",
    profile: {
      id: "simulation-experienced",
      goal: "solve-more-puzzles",
      preferredMinutes: 15,
      avoidedTechniqueIds: []
    },
    skills: techniqueNodes.map((node) => ({
      techniqueId: node.id,
      state: node.tier === 1 ? "mastered" : "unseen",
      distinctStateCount: node.tier === 1 ? 3 : 0,
      recentContradictionCount: 0
    }))
  }
];

for (const scenario of scenarios) {
  console.log(`\n=== ${scenario.name} ===`);
  const skills = new Map(scenario.skills.map((skill) => [skill.techniqueId, skill]));
  const recentActivities = [];
  for (let campaignSequence = 0; campaignSequence < 5; campaignSequence += 1) {
    const result = selectNextActivity({
      profile: scenario.profile,
      skillGraph: skills,
      history: { campaignSequence, recentActivities },
      activityIndex,
      researchPrior,
      now: new Date(Date.UTC(2026, 6, 26, 10, campaignSequence))
    });
    console.log(`\n--- Recommendation ${campaignSequence + 1} ---`);
    console.log(formatSelectorTrace(result));
    if (!result.activity) break;
    recentActivities.push(result.activity);
    skills.set(result.activity.focusTechniqueId, {
      techniqueId: result.activity.focusTechniqueId,
      state: "mastered",
      distinctStateCount: 3,
      recentContradictionCount: 0
    });
  }
}
