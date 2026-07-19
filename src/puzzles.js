// Public coaching profiles and generated-puzzle ratings share this cumulative hierarchy.
// Easy and Medium use the same techniques; the rating engine separates them by logical effort.
export const TECHNIQUE_PROFILES = {
  easy: ["Last Digit", "Naked Single", "Hidden Single"],
  medium: ["Last Digit", "Naked Single", "Hidden Single"],
  hard: [
    "Last Digit",
    "Naked Single",
    "Hidden Single",
    "Pointing Candidates",
    "Claiming Candidates"
  ],
  expert: [
    "Last Digit",
    "Naked Single",
    "Hidden Single",
    "Pointing Candidates",
    "Claiming Candidates",
    "Hidden Pair",
    "Hidden Triple",
    "Hidden Quadruple",
    "Naked Pair",
    "Naked Triple",
    "Naked Quadruple"
  ],
  extreme: [
    "Last Digit",
    "Naked Single",
    "Hidden Single",
    "Pointing Candidates",
    "Claiming Candidates",
    "Hidden Pair",
    "Hidden Triple",
    "Hidden Quadruple",
    "Naked Pair",
    "Naked Triple",
    "Naked Quadruple",
    "X-Wing",
    "Swordfish",
    "Skyscraper",
    "2-String Kite",
    "XY-Wing",
    "XYZ-Wing",
    "W-Wing",
    "Jellyfish",
    "Crane",
    "Simple Colouring",
    "Empty Rectangle"
  ]
};

export const TECHNIQUE_DESCRIPTIONS = {
  "Last Digit": "A row, column, or block has exactly one empty cell, so the missing digit must go there.",
  "Naked Single": "A cell has only one possible digit after checking its row, column, and block.",
  "Hidden Single": "Inside a row, column, or block, a digit can go in only one cell.",
  "Pointing Candidates": "When all candidates for a digit in a block sit in one row or column, that digit can be removed from the rest of that line.",
  "Claiming Candidates": "When all candidates for a digit in a row or column sit inside one block, that digit can be removed from the rest of that block.",
  "Naked Pair": "Two cells share the same two candidates. Those two digits must occupy those cells, so remove them from the rest of the row, column, or block.",
  "Naked Triple": "Three cells in one row, column, or block use only three digits between them. Remove those digits from the other nearby cells.",
  "Naked Quadruple": "Four cells in one row, column, or block use only four digits between them. Remove those digits from the other nearby cells.",
  "Hidden Pair": "Two digits can only fit in the same two cells. Keep those two digits in those cells and remove the other notes there.",
  "Hidden Triple": "Three digits can only fit in the same three cells. Keep those three digits in those cells and remove the other notes there.",
  "Hidden Quadruple": "Four digits can only fit in the same four cells. Keep those four digits in those cells and remove the other notes there.",
  "X-Wing": "For one digit, two rows have possible cells in the same two columns. Remove the digit from other cells in those columns.",
  "Swordfish": "For one digit, three rows have possible cells within the same three columns. Remove the digit from other cells in those columns.",
  "Skyscraper": "For one digit, two rows or columns each have two possible cells. One pair lines up, forcing at least one of the two unaligned cells.",
  "2-String Kite": "For one digit, a two-place row and a two-place column connect through one block. At least one cell outside the block must contain the digit.",
  "XY-Wing": "A two-candidate center cell connects two outer cells that share a third digit. Remove that digit from cells connected to both outer cells.",
  "XYZ-Wing": "A three-candidate center cell connects two outer cells using its digits. Remove their shared digit from cells connected to all three.",
  "W-Wing": "Two matching two-candidate cells connect through a two-place link. Remove the other shared digit from cells connected to both matching cells.",
  "Jellyfish": "A digit is restricted to the same four crossing lines in four rows or columns, so remove it from the other cells in those crossing lines.",
  "Crane": "A two-place link in a block connects to a two-place link in a row or column. One of the two far ends must be true, so cells seeing both cannot keep that digit.",
  "Simple Colouring": "Follow linked two-place candidates for one digit with alternating colours. A candidate that sees both colours can be removed.",
  "Empty Rectangle": "Candidates for one digit form two crossing groups inside a block. Combined with a two-place link outside the block, they eliminate that digit where the two implications meet."
};

export const COACHING_TIER_1 = [
  "Last Digit",
  "Naked Single",
  "Hidden Single",
  "Pointing Candidates",
  "Claiming Candidates",
  "Naked Pair",
  "Hidden Pair",
  "Naked Triple",
  "Hidden Triple",
  "Naked Quadruple"
];

export const COACHING_TIER_2 = [
  "X-Wing",
  "Swordfish",
  "Skyscraper",
  "2-String Kite",
  "XY-Wing",
  "XYZ-Wing",
  "W-Wing"
];

export const COMMITTED_COACHING_TECHNIQUES = [...COACHING_TIER_1, ...COACHING_TIER_2];

export const PROVISIONAL_TECHNIQUES = [
  "Hidden Quadruple",
  "Jellyfish",
  "Crane",
  "Simple Colouring",
  "Empty Rectangle"
];

export const PUZZLES = [
  {
    id: "mood-warmup",
    name: "Warmup Coach",
    difficulty: "easy",
    techniques: ["Last Digit", "Naked Single", "Hidden Single"],
    grid: "530070000600195000098000060800060003400803001700020006060000280000419005000080079"
  },
  {
    id: "candidate-lines",
    name: "Candidate Lines",
    difficulty: "medium",
    techniques: ["Pointing Candidates", "Claiming Candidates", "Hidden Pair"],
    grid: "000260701680070090190004500820100040004602900050003028009300074040050036703018000"
  },
  {
    id: "subsets",
    name: "Subset Trainer",
    difficulty: "hard",
    techniques: ["Naked Pair", "Hidden Pair", "Naked Triple"],
    grid: "005300000800000020070010500400005300010070006003200080060500009004000030000009700"
  },
  {
    id: "fish-and-wings",
    name: "Fish and Wings",
    difficulty: "expert",
    techniques: ["X-Wing", "XY-Wing", "Skyscraper"],
    grid: "000000010400000000020000000000050407008000300001090000300400200050100000000806000"
  },
  {
    id: "extreme-practice",
    name: "Extreme Practice",
    difficulty: "extreme",
    techniques: ["Swordfish", "2-String Kite", "XYZ-Wing", "W-Wing"],
    grid: "100007090030020008009600500005300900010080002600004000300000010040000007007000300"
  }
];

export const TECHNIQUE_LEVELS = TECHNIQUE_PROFILES;
export const SOLVER_TECHNIQUES = [...TECHNIQUE_PROFILES.extreme];
export const ALL_TECHNIQUES = SOLVER_TECHNIQUES;

export const BASIC_TECHNIQUES = [
  "Last Digit",
  "Hidden Single",
  "Naked Single",
  "Pointing Candidates",
  "Claiming Candidates",
  "Hidden Pair",
  "Hidden Triple",
  "Hidden Quadruple",
  "Naked Pair",
  "Naked Triple",
  "Naked Quadruple"
];

export const ADVANCED_TECHNIQUES = [
  "X-Wing",
  "Swordfish",
  "Skyscraper",
  "2-String Kite",
  "XY-Wing",
  "XYZ-Wing",
  "W-Wing",
  "Jellyfish",
  "Crane",
  "Simple Colouring",
  "Empty Rectangle"
];
