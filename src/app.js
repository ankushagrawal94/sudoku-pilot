import "./styles.css";
import { inject } from "@vercel/analytics";
import { createPuzzleJourney } from "./analytics.js";
import { createBrowserProductAnalytics } from "./browserAnalytics.js";
import { DIFFICULTY_ORDER } from "./difficulty.js";
import { generatePuzzle } from "./generator.js";
import { buildCoachingMove } from "./coaching.js";
import { getTechniqueLesson } from "./learning.js";
import { createPracticeState, PRACTICE_MODES } from "./practice.js";
import {
  clearInstallPromotionStatus,
  installPlatform,
  installPromotionStatus,
  saveInstallPromotionStatus
} from "./install.js";
import {
  ADVANCED_TECHNIQUES,
  ALL_TECHNIQUES,
  BASIC_TECHNIQUES,
  COACHING_TIER_1,
  COACHING_TIER_2,
  COMMITTED_COACHING_TECHNIQUES,
  PROVISIONAL_TECHNIQUES
} from "./puzzles.js";
import {
  applyMove,
  applySelectedTechniques,
  candidateSets,
  cellName,
  clonePuzzle,
  colOf,
  createPuzzle,
  fillAllNotes,
  findAllMoves,
  isSolved,
  legalCandidates,
  rowOf
} from "./solver.js";

const app = document.querySelector("#app");
const productAnalytics = createBrowserProductAnalytics();
inject();
productAnalytics.init();
const STORAGE_KEY = "sudoku-pilot-state-v1";
const LEGACY_STORAGE_KEY = "sudoku-method-state-v1";
const PLAYED_PUZZLES_KEY = "sudoku-pilot-played-canonical-v1";
const PLAYER_STATS_KEY = "sudoku-pilot-player-stats-v1";
const TECHNIQUE_DEFAULTS_VERSION = 2;
const playedCanonicalIds = loadPlayedCanonicalIds();
const MAX_HISTORY = 40;
const MAX_PERSISTED_HISTORY = 12;
const FEEDBACK_EMAIL = "hello@sudokupilot.com";
const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
let timerInterval = null;
const viewedLessons = new Set();
let deferredInstallPrompt = null;

const state = createInitialState();
const puzzleJourney = createPuzzleJourney((event, properties) => productAnalytics.capture(event, properties));
const hasSavedProgress = hasPlayerProgress() || state.hintRequested;
puzzleJourney.resume(puzzleAnalyticsContext(), state.puzzleMoveCount, hasSavedProgress);
productAnalytics.capture("app_opened", {
  has_saved_progress: hasSavedProgress,
  local_completed_puzzles: state.playerStats.completed,
  current_view: state.view
});
if (hasSavedProgress) {
  productAnalytics.capture("puzzle_resumed", {
    ...puzzleAnalyticsContext(),
    existing_moves: state.puzzleMoveCount
  });
}

registerInstallEvents();
registerServiceWorker();
render();
startTimer();

function render() {
  state.moves = findAllMoves(state.puzzle, activeHintTechniques());
  if (state.practiceSession && !state.practiceSession.targetApplied) {
    const targetIndex = state.moves.findIndex((move) => sameMoveAction(move, state.practiceSession.targetMove));
    if (targetIndex > 0) state.moves.unshift(...state.moves.splice(targetIndex, 1));
  }
  recordPuzzleCompletion();
  state.hintIndex = Math.min(state.hintIndex, Math.max(0, state.moves.length - 1));
  const check = checkBoard({ revealSolutionMistakes: state.showMistakes });

  app.innerHTML = `
    <section class="shell">
      <header class="app-header">
        <div class="brand-row">
          <h1>sudoku pilot</h1>
          <a class="icon-button header-about-link" href="/about/">About</a>
        </div>
        <nav class="primary-nav" aria-label="Sudoku Pilot sections">
          ${[["play", "Play"], ["learn", "Learn"], ["practice", "Practice"]].map(([view, label]) => `<button class="${state.view === view ? "active" : ""}" data-view="${view}" aria-current="${state.view === view ? "page" : "false"}">${label}</button>`).join("")}
        </nav>
        ${state.view === "play" ? `
          <nav class="difficulty-tabs" aria-label="Difficulty">
            ${DIFFICULTY_ORDER.map((level) => `<button class="${state.difficulty === level ? "active" : ""}" data-difficulty="${level}">${titleCase(level)}</button>`).join("")}
          </nav>
          ${state.showTimer ? `<div class="game-timer"><span data-testid="timer">${formatElapsed(elapsedSeconds())}</span></div>` : ""}
        ` : ""}
      </header>

      ${state.view === "learn" ? renderLessonBrowser() : state.view === "practice" ? renderPracticeBrowser() : `
        ${state.importOpen ? renderImportPanel() : ""}
        ${state.moreOpen ? renderMorePanel() : ""}
        ${state.aboutOpen ? renderAboutPanel() : ""}
        ${state.showMistakes && check.status !== "ok" ? renderCheckPanel(check) : ""}
        <section class="game-layout">
          <section class="play-area">
            ${renderBoard()}
            ${renderKeypad()}
            ${renderHintPanel()}
          </section>
        </section>
      `}
      ${state.completionSummary ? renderCompletionCelebration() : ""}
      ${renderSaveOfflineButton()}
      ${state.installPromptOpen ? renderInstallPrompt() : ""}
    </section>
  `;

  bindEvents();
  saveState();
  focusRequestedHint();
  activateCompletionDialog();
  activateInstallDialog();
}

function activateCompletionDialog() {
  const dialog = app.querySelector("[data-testid='completion-celebration']");
  if (!dialog) return;
  [...dialog.parentElement.children].filter((child) => child !== dialog).forEach((child) => { child.inert = true; });
  dialog.querySelector("[data-action='new-puzzle-after-completion']")?.focus();
}

function activateInstallDialog() {
  const dialog = app.querySelector("[data-testid='install-prompt']");
  if (!dialog) return;
  [...dialog.parentElement.children].filter((child) => child !== dialog).forEach((child) => { child.inert = true; });
  dialog.querySelector("[data-action='install-app'], [data-action='dismiss-install-prompt']")?.focus();
}

function dismissCompletionCelebration() {
  if (shouldPromoteInstall()) saveInstallPromotionStatus("offered");
  state.completionSummary = null;
  render();
  if (state.selected !== null) app.querySelector(`[data-cell='${state.selected}']`)?.focus();
}

function renderCompletionCelebration() {
  const summary = state.completionSummary;
  const promoteInstall = shouldPromoteInstall();
  return `
    <section class="celebration-backdrop" data-testid="completion-celebration" role="dialog" aria-modal="true" aria-labelledby="completion-title">
      <div class="celebration-card">
        <div class="celebration-sparks" aria-hidden="true">
          ${Array.from({ length: 12 }, (_, index) => `<i class="celebration-spark spark-${index + 1}"></i>`).join("")}
        </div>
        <p class="celebration-kicker">Flight complete</p>
        <h2 id="completion-title">Puzzle complete!</h2>
        <p class="celebration-copy">The grid is glowing and your pencil has earned a tiny parade.</p>
        <dl class="completion-stats">
          <div><dt>Time</dt><dd data-testid="completion-time">${formatElapsed(summary.elapsed)}</dd></div>
          <div><dt>Moves</dt><dd data-testid="completion-moves">${summary.moves}</dd></div>
          <div><dt>Completed</dt><dd data-testid="completion-total">${summary.completed}</dd></div>
        </dl>
        <p class="completion-analysis" data-testid="completion-analysis">${summary.analysis}</p>
        ${promoteInstall ? `
          <button class="completion-install-promo" data-action="open-install-prompt" data-testid="completion-install-promo">
            <img src="/icons/icon-192.png" alt="" />
            <span><strong>Keep Sudoku Pilot one tap away</strong><small>Add it to your Home Screen for full-screen, offline play.</small></span>
            <span aria-hidden="true">›</span>
          </button>
        ` : ""}
        <div class="celebration-actions">
          <button data-action="dismiss-celebration">Keep admiring</button>
          <button class="primary" data-action="new-puzzle-after-completion">Fly another puzzle</button>
        </div>
      </div>
    </section>
  `;
}

function renderInstallPrompt() {
  const platform = installPlatform();
  const androidInstall = platform.android && deferredInstallPrompt;
  return `
    <section class="install-backdrop" data-testid="install-prompt" role="dialog" aria-modal="true" aria-labelledby="install-title">
      <div class="install-card">
        <button class="install-close" data-action="dismiss-install-prompt" aria-label="Close install instructions">×</button>
        <img class="install-app-icon" src="/icons/icon-192.png" alt="" />
        <p class="install-kicker">Ready for takeoff</p>
        <h2 id="install-title">Play offline from your Home Screen</h2>
        <p class="install-benefit">It opens full screen, loads without a connection, and stays one tap away.</p>
        ${androidInstall ? `
          <ol class="install-steps">
            <li><span class="install-step-number">1</span><span>Tap <strong>Install now</strong> below.</span></li>
            <li><span class="install-step-number">2</span><span>Confirm <strong>Install</strong> in Chrome.</span></li>
            <li><span class="install-step-number">3</span><span>Open Sudoku Pilot from its new Home Screen icon.</span></li>
          </ol>
          <div class="install-actions">
            <button data-action="dismiss-install-prompt">Not now</button>
            <button class="primary" data-action="install-app">Install now</button>
          </div>
        ` : `
          ${renderIosInstallVisuals()}
          <div class="install-actions">
            <a href="/offline-sudoku-app/">Full offline guide</a>
            <button class="primary" data-action="dismiss-install-prompt">Got it</button>
          </div>
        `}
      </div>
    </section>
  `;
}

function renderSaveOfflineButton() {
  if (installPlatform().standalone) return "";
  return `
    <footer class="save-offline-footer">
      <button class="save-offline-button" data-action="save-offline" data-testid="save-offline">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" /></svg>
        <span>Save offline</span>
      </button>
    </footer>
  `;
}

function renderIosInstallVisuals() {
  const steps = [
    ["/images/ios-install-1-open-share.webp", "Open Safari's menu", "Tap Share.", "Safari menu with the Share action at the top"],
    ["/images/ios-install-2-share-sheet.webp", "Expand the Share Sheet", "Tap View More.", "iOS Share Sheet with the View More action"],
    ["/images/ios-install-3-add-to-home-screen.webp", "Choose Add to Home Screen", "Scroll down and tap Add to Home Screen.", "Expanded iOS Share Sheet with the Add to Home Screen action"],
    ["/images/ios-install-4-confirm.webp", "Confirm the web app", "Keep Open as Web App on, then tap Add.", "Add to Home Screen confirmation with Open as Web App enabled"]
  ];
  return `
    <p class="ios-install-swipe-hint">Swipe through all 4 steps</p>
    <div class="ios-install-walkthrough" aria-label="Four-step visual guide to installing on iPhone">
      ${steps.map(([src, title, instruction, alt], index) => `
        <figure class="ios-install-step">
          <a href="${src}" target="_blank" aria-label="Open step ${index + 1} screenshot full size">
            <img src="${src}" alt="${alt}" width="852" height="${index === 1 || index === 2 ? 1846 : 1853}" loading="lazy" />
          </a>
          <figcaption><span>${index + 1}</span><strong>${title}</strong><small>${instruction}</small></figcaption>
        </figure>
      `).join("")}
    </div>
  `;
}

function shouldPromoteInstall() {
  const platform = installPlatform();
  if (platform.standalone || !platform.mobile || installPromotionStatus() !== "new") return false;
  return platform.ios || Boolean(platform.android && deferredInstallPrompt);
}

function canOpenInstallPrompt() {
  const platform = installPlatform();
  return !platform.standalone && (platform.ios || Boolean(platform.android && deferredInstallPrompt));
}

function openInstallPrompt() {
  saveInstallPromotionStatus("offered");
  state.completionSummary = null;
  state.installPromptOpen = true;
  render();
}

function saveOffline() {
  if (canOpenInstallPrompt()) {
    openInstallPrompt();
    return;
  }
  window.location.assign("/offline-sudoku-app/");
}

function dismissInstallPrompt() {
  saveInstallPromotionStatus("dismissed");
  state.installPromptOpen = false;
  render();
  if (state.selected !== null) app.querySelector(`[data-cell='${state.selected}']`)?.focus();
}

async function installApp() {
  if (!deferredInstallPrompt) return;
  const prompt = deferredInstallPrompt;
  deferredInstallPrompt = null;
  await prompt.prompt();
  const choice = await prompt.userChoice;
  saveInstallPromotionStatus(choice?.outcome === "accepted" ? "installed" : "dismissed");
  state.installPromptOpen = false;
  render();
}

function recordPuzzleCompletion() {
  const solved = isSolved(state.puzzle.values);
  if (!solved) {
    if (state.wasSolved) state.startedAt = Date.now();
    state.wasSolved = false;
    return;
  }
  if (state.wasSolved) return;
  state.wasSolved = true;
  const firstCompletion = !state.completionRecorded;
  if (firstCompletion) {
    state.completionRecorded = true;
    state.playerStats.completed += 1;
    savePlayerStats();
  }
  const elapsed = runningElapsedSeconds();
  if (firstCompletion) {
    puzzleJourney.complete({
      active_seconds: elapsed,
      moves: state.puzzleMoveCount,
      hints_used: state.hintCount,
      local_completed_puzzles: state.playerStats.completed
    });
  }
  state.elapsedBeforeStart = elapsed;
  state.startedAt = Date.now();
  state.completionSummary = {
    elapsed,
    moves: state.puzzleMoveCount,
    completed: state.playerStats.completed,
    analysis: state.hintCount
      ? `You finished with ${state.hintCount} coach assist${state.hintCount === 1 ? "" : "s"}. Every assist is another pattern in your toolkit.`
      : "You solved this one without a hint. Crisp, clean flying."
  };
}

function renderLessonBrowser() {
  const lesson = getTechniqueLesson(state.lessonTechnique);
  const example = createPracticeState(lesson.technique, "find-pattern", 0);
  const stageNumber = Math.min(4, Math.max(1, state.lessonStage));
  const stage = example.coaching.stages[stageNumber - 1];
  const techniqueIndex = COMMITTED_COACHING_TECHNIQUES.indexOf(lesson.technique);
  return `
    <main class="learning-shell" data-testid="lesson-browser">
      <aside class="lesson-navigation panel" aria-label="Technique lessons">
        <label for="lesson-technique-select">Technique</label>
        <select id="lesson-technique-select" data-lesson-select>
          ${renderTechniqueOptions(lesson.technique)}
        </select>
      </aside>
      <article class="lesson-content panel" data-technique="${lesson.technique}">
        <header class="lesson-heading">
          <h2>${lesson.technique}</h2>
        </header>

        ${renderLessonVisual(example)}

        <section data-lesson-section="what-it-is"><h3>What it is</h3><p>${lesson.whatItIs.definition}</p><dl><div><dt>What you will do</dt><dd>${lesson.whatItIs.outcome}</dd></div><div><dt>Know this first</dt><dd>${lesson.whatItIs.prerequisites}</dd></div></dl></section>
        ${renderLessonTerms(lesson.whatItIs.terms)}
        <section data-lesson-section="how-to-recognize"><h3>How to recognize it</h3><p>${lesson.howToRecognize.introduction}</p><ol>${lesson.howToRecognize.steps.map((item) => `<li>${item}</li>`).join("")}</ol><h4>Before you make the move</h4><ul class="recognition-checks">${lesson.howToRecognize.conditions.map((item) => `<li>${item}</li>`).join("")}</ul></section>
        <section data-lesson-section="why-it-works"><h3>Why it works</h3><p>${lesson.whyItWorks.plain}</p><details><summary>Optional technical explanation</summary><p>${lesson.whyItWorks.formal}</p></details></section>
        <section data-lesson-section="worked-example" class="worked-example">
          <div class="panel-title"><h3>Worked example</h3><span>Stage ${stageNumber} of 4</span></div>
          <article class="hint-card coaching-stage"><p class="eyebrow">${stageNumber}. ${coachingStageLabel(stage.kind)}</p><p data-testid="lesson-stage-message">${stage.message}</p></article>
          ${stageNumber === 3 ? renderHintBoard(example.targetMove, example.coaching, 3, example.puzzle) : ""}
          ${stageNumber === 4 ? `${renderMoveActions(example.targetMove)}${renderVisualLegend(example.coaching)}${renderHintBoard(example.targetMove, example.coaching, 4, example.puzzle)}<p class="text-equivalent"><strong>In words:</strong> ${example.coaching.exactExplanation} ${example.coaching.deeperExplanation}</p>` : ""}
          <div class="tool-row">
            <button data-action="previous-lesson-stage" ${stageNumber === 1 ? "disabled" : ""}>Previous stage</button>
            <button class="primary" data-action="next-lesson-stage" ${stageNumber === 4 ? "disabled" : ""}>Next stage</button>
          </div>
        </section>
        <section data-lesson-section="common-mistakes"><h3>Common mistakes</h3><div class="near-miss-note"><strong>A look-alike that does not work:</strong> ${lesson.commonMistakes.nearMiss}</div><ul>${lesson.commonMistakes.items.map((item) => `<li>${item}</li>`).join("")}</ul></section>
        <section data-lesson-section="try-it" class="try-it"><h3>Try it</h3><p>Open a verified example where ${lesson.technique} is ready to find.</p><button class="primary" data-action="practice-from-lesson">${lesson.tryIt.label}</button></section>
        ${renderLessonPagination(techniqueIndex)}
      </article>
    </main>
  `;
}

function renderLessonVisual(example) {
  const resultDescription = example.coaching.eliminations.length
    ? "red marks show the candidates you can remove"
    : "the blue digit shows what you can place";
  return `
    <figure class="lesson-visual" data-testid="lesson-visual">
      <div class="lesson-visual-board">
        ${renderHintBoard(example.targetMove, example.coaching, 4, example.puzzle)}
      </div>
      ${renderVisualLegend(example.coaching)}
      <figcaption>A real ${example.technique} pattern. Green marks show the pattern; ${resultDescription}.</figcaption>
    </figure>
  `;
}

function renderLessonPagination(techniqueIndex) {
  return `
    <nav class="lesson-pagination lesson-pagination-bottom" aria-label="Lesson navigation">
      <button data-action="previous-lesson" ${techniqueIndex === 0 ? "disabled" : ""}>Previous</button>
      <span>${techniqueIndex + 1} of ${COMMITTED_COACHING_TECHNIQUES.length}</span>
      <button data-action="next-lesson" ${techniqueIndex === COMMITTED_COACHING_TECHNIQUES.length - 1 ? "disabled" : ""}>Next</button>
    </nav>
  `;
}

function renderLessonTerms(terms) {
  if (!terms.length) return "";
  return `<section class="lesson-terms" data-lesson-section="words-used"><h3>Words used in this lesson</h3><dl>${terms.map(({ term, definition }) => `<div><dt>${term}</dt><dd>${definition}</dd></div>`).join("")}</dl></section>`;
}

function coachingStageLabel(kind) {
  return ({
    technique: "The pattern",
    "search-focus": "First clue",
    "structural-location": "Where to look",
    "exact-move": "Exact move"
  })[kind] || kind.replaceAll("-", " ");
}

function renderPracticeBrowser() {
  const activeMode = PRACTICE_MODES.find(({ id }) => id === state.practiceMode);
  const sessionMatches = state.practiceSession?.technique === state.practiceTechnique && state.practiceSession?.mode === state.practiceMode;
  return `
    <main class="practice-shell" data-testid="practice-browser">
      <section class="practice-controls panel">
        <div><p class="eyebrow">Deliberate practice</p><h2>${state.practiceTechnique}</h2><p>${activeMode.description}</p></div>
        <label for="practice-technique-select">Technique</label>
        <select id="practice-technique-select" data-practice-technique>${renderTechniqueOptions(state.practiceTechnique)}</select>
        <div class="practice-mode-tabs" role="tablist" aria-label="Practice modes">
          ${PRACTICE_MODES.map((mode) => `<button role="tab" aria-selected="${state.practiceMode === mode.id}" class="${state.practiceMode === mode.id ? "active" : ""}" data-practice-mode="${mode.id}">${mode.label}</button>`).join("")}
        </div>
        ${!sessionMatches && !state.practiceError ? `<button class="primary" data-action="start-certified-practice">Start ${activeMode.label}</button>` : ""}
      </section>
      ${state.practiceError ? renderPracticeError() : sessionMatches ? renderPracticeSession(state.practiceSession) : `<section class="panel practice-empty"><p>Choose what you want to practice, then open a verified example.</p></section>`}
    </main>
  `;
}

function renderPracticeError() {
  return `
    <section class="panel practice-error" data-testid="practice-error" role="alert">
      <h3>That example could not start</h3><p>${state.practiceError}</p>
      <div class="tool-row"><button class="primary" data-action="practice-retry">Retry this technique</button><button data-action="practice-next-technique">Choose the next technique</button><button data-action="back-to-lesson">Review the lesson</button></div>
    </section>
  `;
}

function renderPracticeSession(session) {
  const mode = PRACTICE_MODES.find(({ id }) => id === session.mode);
  const targetApplied = Boolean(session.targetApplied);
  return `
    <section class="practice-session" data-testid="practice-session" data-practice-mode="${session.mode}" data-technique="${session.technique}">
      <section class="panel practice-status">
        <div class="panel-title"><h3>${mode.label}</h3><span>Example ${session.fixtureIndex + 1} of 10</span></div>
        <p>${practicePrompt(session)}</p>
        <details class="practice-verification"><summary>Why this example is trustworthy</summary><ul class="certification-list"><li>It has exactly one solution.</li><li>${session.technique} works on the board now.</li><li>The shown move preserves the solution.</li><li>You can finish with techniques taught in Sudoku Pilot.</li></ul></details>
        ${targetApplied ? `<p class="practice-success" role="status">Nice, the ${session.technique} move is applied. Keep solving or open another example.</p>` : ""}
        <div class="tool-row"><button data-action="back-to-lesson">Review lesson</button><button class="primary" data-action="next-practice-example">Start another example</button></div>
      </section>
      ${session.mode === "near-miss" ? renderNearMissPractice(session) : `
        <section class="practice-board-area">
          ${renderBoard()}
          ${renderKeypad()}
          ${renderHintPanel()}
        </section>
      `}
    </section>
  `;
}

function renderNearMissPractice(session) {
  const answered = state.practiceAnswer !== null;
  const correct = answered && state.practiceAnswer === session.nearMiss.valid;
  const claimCoaching = {
    ...session.coaching,
    evidenceCandidates: session.nearMiss.evidenceCandidates,
    evidenceCells: session.nearMiss.evidenceCells,
    eliminations: [],
    placements: [],
    relationships: [],
    visualization: {
      ...session.coaching.visualization,
      evidenceCandidates: session.nearMiss.evidenceCandidates,
      evidenceCells: session.nearMiss.evidenceCells,
      eliminations: [],
      placements: [],
      relationships: []
    }
  };
  return `
    <section class="panel near-miss-practice">
      <h3>${session.nearMiss.prompt}</h3>
      <p>Outlined candidates show the proposed pattern. Check their counts and positions; the answer does not depend on color.</p>
      ${renderHintBoard(session.targetMove, claimCoaching, 4, session.puzzle)}
      ${!answered ? `<div class="answer-row"><button class="primary" data-action="practice-answer-valid">Yes, it is valid</button><button data-action="practice-answer-invalid">No, one rule is broken</button></div>` : `
        <div class="practice-result ${correct ? "correct" : "incorrect"}" data-testid="practice-result" role="status"><strong>${correct ? "Correct." : "Not quite."}</strong> ${session.nearMiss.explanation}</div>
        <h4>The complete pattern and move</h4>
        ${renderVisualLegend(session.coaching)}
        ${renderHintBoard(session.targetMove, session.coaching, 4, session.puzzle)}
        ${renderMoveActions(session.targetMove)}
        <p class="text-equivalent"><strong>In words:</strong> ${session.coaching.exactExplanation} ${session.coaching.deeperExplanation}</p>
      `}
    </section>
  `;
}

function practicePrompt(session) {
  if (session.mode === "find-pattern") return `Find ${session.technique}. The board is ready for one. Open Hint for four clues, from a small nudge to the exact move.`;
  if (session.mode === "complete-puzzle") return `Solve the puzzle. The first useful move is ${session.technique}, and every later step can use a technique taught in Sudoku Pilot.`;
  return `Check the highlighted cells against the lesson rules. Is this a real ${session.technique} or a look-alike?`;
}

function renderTechniqueOptions(selected) {
  return [
    `<optgroup label="Tier 1 · Foundations">${COACHING_TIER_1.map((technique) => `<option value="${technique}" ${technique === selected ? "selected" : ""}>${technique}</option>`).join("")}</optgroup>`,
    `<optgroup label="Tier 2 · Advanced">${COACHING_TIER_2.map((technique) => `<option value="${technique}" ${technique === selected ? "selected" : ""}>${technique}</option>`).join("")}</optgroup>`
  ].join("");
}

function renderBoard() {
  const highlightedDigit = state.selected === null ? null : highlightedDigitForSelection();
  const showCounts = state.lineCountsVisible && highlightedDigit;
  const counts = showCounts ? getLineCounts(highlightedDigit) : null;
  return `
    <div class="board-frame ${showCounts ? "show-counts" : ""}" data-testid="board-frame">
      ${showCounts ? `
        <div class="count-corner">${highlightedDigit}</div>
        <div class="column-counts" aria-label="Selected digit column counts">
          ${counts.columns.map((count, col) => `<span class="${count === 2 ? "pair-count" : ""}" data-testid="col-count-${col}" title="${count} ${highlightedDigit}s in column ${col + 1}">${count}</span>`).join("")}
        </div>
        <div class="row-counts" aria-label="Selected digit row counts">
          ${counts.rows.map((count, row) => `<span class="${count === 2 ? "pair-count" : ""}" data-testid="row-count-${row}" title="${count} ${highlightedDigit}s in row ${row + 1}">${count}</span>`).join("")}
        </div>
      ` : ""}
      <div class="board ${state.numberMode === "note" ? "note-entry-mode" : "value-entry-mode"}" role="grid" aria-label="Sudoku board" data-testid="board">
        ${state.puzzle.values.map((value, index) => {
          const notes = [...state.puzzle.notes[index]].sort((a, b) => a - b);
          const selected = index === state.selected;
          const multiSelected = state.multiSelected.has(index);
          const related = state.highlightPeers && state.selected !== null && (rowOf(index) === rowOf(state.selected) || colOf(index) === colOf(state.selected) || sameBox(index, state.selected));
          const sameDigit = state.highlightMatches && highlightedDigit && (value === highlightedDigit || notes.includes(highlightedDigit));
          const issue = state.showMistakes && state.boardIssues?.has(index);
          return `
            <button class="cell ${state.puzzle.givens[index] ? "given" : ""} ${selected ? "selected" : ""} ${multiSelected ? "multi-selected" : ""} ${related ? "related" : ""} ${sameDigit ? "same-digit" : ""} ${issue ? "issue" : ""}" data-cell="${index}" data-testid="cell-${index}" aria-label="${cellDescription(index, value, notes, state.puzzle.givens[index], selected, issue)}" aria-pressed="${selected}">
              ${value ? `<span class="value">${value}</span>` : `<span class="notes">${[1,2,3,4,5,6,7,8,9].map((digit) => `<i class="${notes.includes(digit) ? "on" : ""}">${digit}</i>`).join("")}</span>`}
            </button>
          `;
        }).join("")}
      </div>
    </div>
  `;
}

function isDigitComplete(digit) {
  const placements = state.puzzle.values.flatMap((value, index) => value === digit ? [index] : []);
  if (placements.length !== 9) return false;
  const boxes = placements.map((index) => Math.floor(rowOf(index) / 3) * 3 + Math.floor(colOf(index) / 3));
  return new Set(placements.map(rowOf)).size === 9
    && new Set(placements.map(colOf)).size === 9
    && new Set(boxes).size === 9;
}

function renderKeypad() {
  const completedDigits = new Set(
    [1,2,3,4,5,6,7,8,9].filter(isDigitComplete)
  );
  return `
    <section class="mobile-controls" aria-label="Puzzle controls">
      <div class="digits" aria-label="Number pad">
        ${[1,2,3,4,5,6,7,8,9].map((digit) => {
          const completed = completedDigits.has(digit);
          const active = state.entryMethod === "digit-first" && state.selectedDigit === digit;
          return `<button class="${active ? "active " : ""}${completed ? "completed" : ""}" data-digit="${digit}"${completed ? ` aria-label="${digit}, completed"` : ""}>${digit}</button>`;
        }).join("")}
      </div>
      <div class="keypad-control-group" role="group" aria-labelledby="entry-mode-label">
        <span class="keypad-control-label" id="entry-mode-label">Entry mode</span>
        <button class="note-mode-toggle ${state.numberMode === "note" ? "active" : ""}" data-action="toggle-notes" role="switch" aria-checked="${state.numberMode === "note"}" aria-labelledby="notes-mode-label" aria-describedby="notes-mode-description">
          <span class="note-mode-copy">
            <strong id="notes-mode-label">Notes</strong>
            <span id="notes-mode-description">${state.numberMode === "note" ? "On: numbers add pencil notes" : "Off: numbers fill cells"}</span>
          </span>
          <span class="note-mode-indicator" aria-hidden="true">
            <span class="note-mode-state">${state.numberMode === "note" ? "On" : "Off"}</span>
            <span class="toggle-track"><span class="toggle-knob"></span></span>
          </span>
        </button>
      </div>
      <div class="tool-grid">
        <button class="tool-button ${state.multiSelectMode ? "active" : ""}" data-action="toggle-multi" data-testid="multi-select"><span>Multi</span></button>
        <button class="tool-button" data-action="undo"><span>Undo</span></button>
        <button class="tool-button" data-action="erase"><span>Erase</span></button>
        <button class="tool-button primary-tool ${isHintOpen() ? "active" : ""}" data-action="hint" data-testid="hint-button"><span>Hint</span></button>
        <button class="tool-button ${state.moreOpen ? "active" : ""}" data-action="toggle-more"><span>More</span></button>
      </div>
      ${state.previousPuzzle ? `<button data-action="restore-previous">Restore previous puzzle</button>` : ""}
      <div class="keypad-control-groups">
        <div class="keypad-control-group">
          <span class="keypad-control-label" id="puzzle-notes-label">Puzzle notes</span>
          <div class="puzzle-note-actions" role="group" aria-labelledby="puzzle-notes-label">
            <button data-action="fill-notes" title="Replace notes in every empty cell with all currently legal candidates.">Fill all notes</button>
            <button data-action="clear-notes" title="Remove every pencil note from the puzzle.">Clear all notes</button>
          </div>
        </div>
      </div>
      <div class="view-options" aria-label="Puzzle view options">
        <button class="${state.lineCountsVisible ? "active" : ""}" data-action="toggle-line-counts" aria-pressed="${state.lineCountsVisible}">Line counts</button>
      </div>
      ${state.runMessage ? `<p class="run-message" data-testid="run-message">${state.runMessage}</p>` : ""}
    </section>
  `;
}

function renderMorePanel() {
  return `
    <section class="panel more-panel" data-testid="more-panel">
      <div class="panel-title">
        <h2>More</h2>
        <button class="primary" data-action="toggle-more">Close</button>
      </div>
      ${renderNewPuzzle()}
      ${renderPreferencesPanel()}
      ${renderAutomationPanel()}
      ${renderTechniqueFilters()}
      ${renderInfoPanel()}
      <section class="sub-panel">
        <h2>Local data</h2>
        <p class="caption">Puzzle progress is stored only in this browser.</p>
        <button data-action="clear-local-data">Clear local data</button>
      </section>
    </section>
  `;
}

function renderPreferencesPanel() {
  return `
    <section class="sub-panel settings-area" data-testid="preferences-panel">
      <div class="panel-title"><h2>Preferences</h2></div>
      <label><input type="checkbox" data-preference="showMistakes" ${state.showMistakes ? "checked" : ""} /> Show mistakes as I play</label>
      <label><input type="checkbox" data-preference="showTimer" ${state.showTimer ? "checked" : ""} /> Show timer</label>
      <label><input type="checkbox" data-preference="highlightPeers" ${state.highlightPeers ? "checked" : ""} /> Highlight row, column, and box</label>
      <label><input type="checkbox" data-preference="highlightMatches" ${state.highlightMatches ? "checked" : ""} /> Highlight matching values and notes</label>
      <label>Input order
        <select data-entry-method>
          <option value="cell-first" ${state.entryMethod === "cell-first" ? "selected" : ""}>Cell first</option>
          <option value="digit-first" ${state.entryMethod === "digit-first" ? "selected" : ""}>Digit first</option>
        </select>
      </label>
      <p class="caption">You can still check the board when requesting a hint. These choices are saved on this device.</p>
    </section>
  `;
}

function renderNewPuzzle() {
  return `
    <section class="sub-panel new-panel">
      <div class="panel-title">
        <h2>Start</h2>
      </div>
      <div class="action-stack">
        <button class="primary" data-action="new-puzzle" data-testid="new-puzzle">New generated puzzle</button>
        <button data-action="toggle-import">Import screenshot</button>
      </div>
    </section>
  `;
}

function renderTechniqueFilters() {
  return `
    <section class="sub-panel technique-panel">
      <div class="panel-title">
        <h2>Techniques</h2>
      </div>
      <div class="shortcut-row">
        <button data-action="select-basic">Use basic set</button>
        <button data-action="select-advanced">Use advanced set</button>
        <button data-action="select-all">Use all</button>
      </div>
      <div class="techniques">
        ${ALL_TECHNIQUES.map((technique) => `
          <div class="technique-item">
            <label>
              <input type="checkbox" data-technique="${technique}" ${state.allowedTechniques.has(technique) ? "checked" : ""} />
              <span>${technique}${PROVISIONAL_TECHNIQUES.includes(technique) ? `<small>Provisional detector</small>` : ""}</span>
            </label>
            <button data-run-technique="${technique}" aria-label="Run ${technique}">Run</button>
          </div>
        `).join("")}
      </div>
    </section>
  `;
}

function renderAutomationPanel() {
  return `
    <section class="sub-panel automation-panel">
      <div class="panel-title">
        <h2>Run techniques</h2>
      </div>
      <p class="caption">Run every checked technique repeatedly until none of them can move the board forward.</p>
      <button class="primary wide" data-action="run-selected" data-testid="run-selected">Run selected techniques</button>
    </section>
  `;
}

function renderInfoPanel() {
  const installAvailable = canOpenInstallPrompt();
  return `
    <section class="sub-panel info-panel">
      <div class="panel-title">
        <h2>Learn</h2>
      </div>
      <div class="action-stack">
        <button data-action="toggle-about">About Sudoku Pilot</button>
        <a class="button-link" href="${feedbackHref()}">Send feedback</a>
      </div>
      <p class="caption">Feedback opens your email app with puzzle context in the subject.</p>
      <div class="offline-install-box">
        <img src="/icons/icon-192.png" alt="" />
        <div><strong>Play offline</strong><p>Add Sudoku Pilot to your Home Screen for full-screen play without a connection.</p></div>
        ${installAvailable ? `<button data-action="open-install-prompt">How to install</button>` : `<a class="button-link" href="/offline-sudoku-app/">Setup guide</a>`}
      </div>
      <div class="content-links" aria-label="Learn about Sudoku Pilot">
        <a class="button-link" href="/sudoku-coach/">How the coach works</a>
        <a class="button-link" href="/practice-sudoku-techniques/">Technique practice</a>
        <a class="button-link" href="/sudoku-without-guessing/">Our puzzle guarantee</a>
        <a class="button-link" href="/why-we-built-this/">Why we built this</a>
        <a class="button-link" href="/offline-sudoku-app/">Offline setup guide</a>
        <a class="button-link" href="/contact/">Contact</a>
        <a class="button-link" href="/privacy/">Privacy</a>
      </div>
    </section>
  `;
}

function renderAboutPanel() {
  return `
    <section class="panel about-panel" data-testid="about-panel">
      <div class="panel-title">
        <h2>About Sudoku Pilot</h2>
        <button data-action="toggle-about">Close</button>
      </div>
          <p>Sudoku Pilot is a practice-first Sudoku trainer that helps you recognize logical techniques and understand each move.</p>
      <div class="about-grid">
        <article>
          <h3>Coach hints</h3>
          <p>Hints start with notes and mistakes, then move from gentle clues to exact technique steps.</p>
        </article>
        <article>
          <h3>Technique practice</h3>
          <p>Choose basic or advanced methods, run one technique, or practice until a selected method appears.</p>
        </article>
        <article>
          <h3>Pattern tools</h3>
          <p>Multi-select notes, selected-digit highlighting, and line counts help you inspect structure without solving the move for you.</p>
        </article>
        <article>
          <h3>Offline play</h3>
          <p>Install it from your phone browser, then keep solving and generating puzzles without a connection.</p>
        </article>
        <article>
          <h3>Certified logical path</h3>
          <p>Every generated puzzle has one solution and a complete trace using the techniques available in the coach.</p>
          <a href="/sudoku-without-guessing/">Read the puzzle guarantee</a>
        </article>
      </div>
      <div class="feedback-box">
        <h3>Feedback</h3>
        <p>Send a bug report, confusing hint, or feature idea from the current puzzle state.</p>
        <a class="button-link primary" href="${feedbackHref()}">Email feedback</a>
        <a class="button-link" href="/privacy/">Privacy</a>
      </div>
      <div class="feedback-box">
        <h3>Source available</h3>
        <p>Sudoku Pilot is provided without warranty under the PolyForm Noncommercial License 1.0.0. Commercial use and use of the Sudoku Pilot brand are not licensed.</p>
        <a class="button-link" href="/privacy/#source-code">Source code</a>
        <a class="button-link" href="/licenses/PolyForm-Noncommercial-1.0.0.txt">License</a>
        <a class="button-link" href="/third-party-notices.txt">Third-party notices</a>
      </div>
    </section>
  `;
}

function renderCheckPanel(check) {
  return `
    <section class="panel check-panel" data-testid="check-panel">
      <div class="panel-title"><h2>Check board</h2></div>
      <p>${check.message}</p>
      <ul class="actions-list">${check.details.slice(0, 6).map((detail) => `<li>${detail}</li>`).join("")}</ul>
    </section>
  `;
}

function renderHintPanel() {
  if (state.hintMode === "closed" && !state.allMovesVisible) return "";
  if (state.allMovesVisible) return renderAllMovesPanel();

  const diagnosis = diagnoseNotes();
  if (state.hintMode === "coach" && !state.skipNoteDiagnosis && diagnosis.type === "missing") {
    return `
      <section class="panel hint-panel" data-testid="hint-panel">
        <div class="panel-title"><h2>Hint</h2></div>
        <p>${diagnosis.message}</p>
        <div class="tool-row">
          <button class="primary" data-action="fill-notes">Fill all notes</button>
          <button data-action="show-technique">Show technique anyway</button>
        </div>
      </section>
    `;
  }
  if (state.hintMode === "coach" && !state.skipNoteDiagnosis && diagnosis.type === "mistake") {
    return `
      <section class="panel hint-panel" data-testid="hint-panel">
        <div class="panel-title"><h2>Hint</h2></div>
        <p>${diagnosis.message}</p>
        <ul class="actions-list">${diagnosis.corrections.slice(0, 8).map((item) => `<li>Remove ${item.digit} from ${cellName(item.index)}</li>`).join("")}</ul>
        <div class="tool-row"><button class="primary" data-action="fix-notes">Fix notes</button></div>
      </section>
    `;
  }

  const move = state.moves[state.hintIndex];
  if (!move) {
    return renderNoMovesPanel("Hint");
  }
  const coachingMove = buildCoachingMove(move, state.puzzle);
  if (coachingMove) return renderProgressiveHint(move, coachingMove);
  return state.hintStage >= 4 ? renderMovePanel(move, "Hint") : renderProvisionalHint(move);
}

function renderAllMovesPanel() {
  if (!state.moves.length) {
    return renderNoMovesPanel("All possible moves");
  }
  const move = state.moves[state.hintIndex];
  return `
    <section class="panel hint-panel" data-testid="hint-panel">
      <div class="panel-title">
        <h2>All possible moves</h2>
        <span>${state.hintIndex + 1} / ${state.moves.length}</span>
      </div>
      <div class="move-summary">
        ${groupMoves(state.moves).map(([technique, count]) => `<button data-jump-technique="${technique}">${count} ${technique}</button>`).join("")}
      </div>
      ${renderMovePanel(move, "", true)}
    </section>
  `;
}

function renderNoMovesPanel(title) {
  const searchesAllTechniques = ALL_TECHNIQUES.every((technique) => activeHintTechniques().includes(technique));
  return `
    <section class="panel hint-panel" data-testid="hint-panel">
      <div class="panel-title"><h2>${title}</h2></div>
      <p class="empty">${searchesAllTechniques ? "I couldn't find a supported logical next step from this position." : "No hint is available with your current technique filter."}</p>
      <div class="tool-row">
        <button class="primary" data-action="fill-notes">Fill all notes</button>
        ${searchesAllTechniques ? "" : `
          <button data-action="enable-all-techniques">Search all techniques</button>
          <button data-action="edit-techniques">Change technique filter</button>
        `}
      </div>
    </section>
  `;
}

function activeHintTechniques() {
  if (state.view === "practice" && state.practiceSession) {
    if (state.practiceSession.hintUsesAllTechniques || state.practiceSession.targetApplied) return ALL_TECHNIQUES;
    return state.practiceSession.mode === "find-pattern"
      ? [state.practiceSession.technique]
      : COMMITTED_COACHING_TECHNIQUES;
  }
  return [...state.allowedTechniques];
}

function renderMovePanel(move, title = "Hint", nested = false) {
  return `
    <${nested ? "div" : "section"} class="${nested ? "" : "panel "}hint-panel" ${nested ? "" : "data-testid=\"hint-panel\""}>
      ${title ? `<div class="panel-title"><h2>${title}</h2><span>${state.hintIndex + 1} / ${state.moves.length}</span></div>` : ""}
      <article class="hint-card">
        <p class="eyebrow">${move.technique}</p>
        <h3>${move.title}</h3>
        <p>${move.description}</p>
        <p>${move.explanation}</p>
        ${renderMoveActions(move)}
      </article>
      <div class="hint-legend">
        <span><i class="green"></i> evidence</span>
        <span><i class="red"></i> eliminations</span>
      </div>
      <div class="tool-row">
        <button data-action="prev-hint">Back</button>
        <button data-action="next-hint">Forward</button>
        <button class="primary" data-action="apply-hint">Apply</button>
        <button data-action="close-hint">Close</button>
      </div>
      ${renderHintBoard(move)}
    </${nested ? "div" : "section"}>
  `;
}

function renderProgressiveHint(move, coachingMove) {
  const stageNumber = Math.min(4, Math.max(1, state.hintStage || 1));
  const stage = coachingMove.stages[stageNumber - 1];
  const exact = stageNumber === 4;
  return `
    <section class="panel hint-panel coaching-panel" data-testid="hint-panel" data-hint-stage="${stageNumber}" data-technique="${move.technique}">
      <div class="panel-title"><h2>Hint</h2><span>Clue ${stageNumber} of 4</span></div>
      <article class="hint-card coaching-stage">
        <p class="eyebrow">${stageNumber}. ${coachingStageLabel(stage.kind)}</p>
        <h3>${stageNumber === 1 ? move.technique : `Keep looking for ${move.technique}`}</h3>
        <p data-testid="hint-stage-message">${stage.message}</p>
        ${exact ? `
          ${renderMoveActions(move)}
          <details class="why-disclosure">
            <summary>Why this works</summary>
            <p>${coachingMove.deeperExplanation}</p>
            ${renderRelationshipText(coachingMove)}
          </details>
        ` : ""}
      </article>
      ${stageNumber === 3 ? renderHintBoard(move, coachingMove, 3) : ""}
      ${exact ? `
        ${renderVisualLegend(coachingMove)}
        ${renderHintBoard(move, coachingMove, 4)}
      ` : ""}
      <div class="tool-row coaching-controls">
        ${stageNumber > 1 ? `<button data-action="previous-hint-stage">Previous clue</button>` : ""}
        ${stageNumber < 4 ? `<button class="primary" data-action="next-hint-stage">Next clue</button>` : ""}
        ${exact ? `<button class="primary" data-action="apply-hint">Apply</button>` : ""}
        <button data-action="toggle-all-moves">All moves</button>
        <button data-action="close-hint">Close</button>
      </div>
    </section>
  `;
}

function renderProvisionalHint(move) {
  return `
    <section class="panel hint-panel" data-testid="hint-panel" data-hint-stage="1" data-technique="${move.technique}">
      <div class="panel-title"><h2>Hint</h2><span>Provisional detector</span></div>
      <p><strong>${move.technique}</strong> can help next.</p>
      <p>${move.description}</p>
      <p class="caption">This technique is outside the committed progressive-coaching catalog.</p>
      <div class="tool-row">
        <button class="primary" data-action="show-exact-hint">Show exact move</button>
        <button data-action="toggle-all-moves">All moves</button>
        <button data-action="close-hint">Close</button>
      </div>
    </section>
  `;
}

function renderMoveActions(move) {
  const fills = move.fills.map((fill) => `<li>Place ${fill.digit} in ${learnerCellName(fill.index)}</li>`).join("");
  const eliminations = move.eliminations.map((elim) => `<li>Remove candidate ${elim.digit} from ${learnerCellName(elim.index)}</li>`).join("");
  return `<ul class="actions-list">${fills}${eliminations}</ul>`;
}

function learnerCellName(index) {
  return `row ${rowOf(index) + 1}, column ${colOf(index) + 1} <span class="cell-code">(${cellName(index)})</span>`;
}

function renderHintBoard(move, coachingMove = buildCoachingMove(move, state.puzzle), stage = 4, puzzle = state.puzzle) {
  const logicalCandidates = candidateSets(puzzle);
  const searchCells = new Set(stage === 3 ? coachingMove?.visualization.searchCells || [] : []);
  const evidence = stage === 4 ? coachingMove?.evidenceCandidates || move.evidence : [];
  const eliminations = stage === 4 ? coachingMove?.eliminations || move.eliminations : [];
  const placements = stage === 4 ? coachingMove?.placements || move.fills : [];
  return `
    <div class="mini-board-wrap" data-visual-stage="${stage}">
    <div class="mini-board" role="img" aria-label="${stage === 3 ? "Highlighted search region" : `Exact ${move.technique} explanation board`}">
      ${puzzle.values.map((value, index) => {
        const evidenceItems = evidence.filter((item) => item.index === index);
        const evidenceDigits = evidenceItems.map((item) => item.digit);
        const elimDigits = eliminations.filter((item) => item.index === index).map((item) => item.digit);
        const fillDigit = placements.find((item) => item.index === index)?.digit;
        const notes = [...logicalCandidates[index]].sort((a, b) => a - b);
        const valueRole = value ? (puzzle.givens[index] ? "given" : "player") : "";
        return `
          <div class="mini-cell ${searchCells.has(index) ? "search-region" : ""} ${evidenceDigits.length ? "evidence" : ""} ${elimDigits.length ? "eliminate" : ""} ${fillDigit ? "fill" : ""} ${valueRole}" data-mini-cell="${index}" ${searchCells.has(index) ? "data-visual-role=\"search-region\"" : evidenceDigits.length ? "data-visual-role=\"evidence\"" : ""}>
            ${value || fillDigit ? `<strong class="${fillDigit ? "placement" : valueRole}" data-visual-role="${fillDigit ? "placement" : valueRole}">${value || fillDigit}</strong>` : [1,2,3,4,5,6,7,8,9].map((digit) => {
              const evidenceItem = evidenceItems.find((item) => item.digit === digit);
              const visualRole = evidenceItem ? "evidence" : elimDigits.includes(digit) ? "elimination" : notes.includes(digit) ? "ordinary-candidate" : "";
              const cls = visualRole === "evidence" ? `evidence-candidate ${evidenceItem.role || ""}` : visualRole === "elimination" ? "elimination-candidate" : visualRole === "ordinary-candidate" ? "on" : "";
              return `<i class="${cls}" ${visualRole ? `data-visual-role="${visualRole}"` : ""} data-candidate="${digit}">${digit}</i>`;
            }).join("")}
          </div>
        `;
      }).join("")}
    </div>
    ${stage === 4 ? renderRelationshipOverlay(coachingMove?.relationships || []) : ""}
    </div>
  `;
}

function renderVisualLegend(coachingMove) {
  const roles = new Set(coachingMove.visualization.roles);
  return `
    <div class="hint-legend" aria-label="Explanation legend">
      ${roles.has("search-region") ? `<span><i class="legend-search"></i> where to look</span>` : ""}
      <span><i class="legend-evidence"></i> pattern cells</span>
      ${coachingMove.relationships.some(({ kind }) => kind === "strong") ? `<span><i class="legend-strong"></i> exactly two places</span>` : ""}
      ${coachingMove.relationships.some(({ kind }) => kind === "weak") ? `<span><i class="legend-weak"></i> cannot both be true</span>` : ""}
      ${coachingMove.relationships.some(({ kind }) => kind === "visibility") ? `<span><i class="legend-visibility"></i> shares a row, column, or block</span>` : ""}
      ${coachingMove.eliminations.length ? `<span><i class="legend-elimination"></i> candidate to remove</span>` : ""}
      ${coachingMove.placements.length ? `<span><i class="legend-placement"></i> digit to place</span>` : ""}
    </div>
  `;
}

function renderRelationshipOverlay(relationships) {
  if (!relationships.length) return "";
  return `
    <svg class="relationship-overlay" viewBox="0 0 900 900" aria-hidden="true">
      ${relationships.map((relationship) => {
        const from = candidatePoint(relationship.from);
        const to = candidatePoint(relationship.to);
        return `<line class="relationship ${relationship.kind}" x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" data-relationship="${relationship.kind}" />`;
      }).join("")}
    </svg>
  `;
}

function renderRelationshipText(coachingMove) {
  if (!coachingMove.relationships.length) return "";
  return `
    <ul class="relationship-text" aria-label="Pattern relationships">
      ${coachingMove.relationships.map(({ kind, from, to }) => `<li>${relationshipLabel(kind)} between ${learnerCellName(from.index)} and ${learnerCellName(to.index)}${from.digit ? ` for candidate ${from.digit}` : ""}</li>`).join("")}
    </ul>
  `;
}

function candidatePoint({ index, digit }) {
  const cellX = colOf(index) * 100;
  const cellY = rowOf(index) * 100;
  if (!digit) return { x: cellX + 50, y: cellY + 50 };
  return {
    x: cellX + ((digit - 1) % 3) * (100 / 3) + (100 / 6),
    y: cellY + Math.floor((digit - 1) / 3) * (100 / 3) + (100 / 6)
  };
}

function relationshipLabel(kind) {
  if (kind === "strong") return "Exactly two possible cells";
  if (kind === "visibility") return "Shares a row, column, or block";
  if (kind === "weak") return "Cannot both contain this digit";
  return "Pattern connection";
}

function renderImportPanel() {
  return `
    <section class="panel import-panel analytics-image-block">
      <div class="panel-title">
        <h2>Import screenshot</h2>
        <button data-action="toggle-import">Close</button>
      </div>
      <input type="file" accept="image/png,image/jpeg,image/webp" data-import-file ${state.ocrLoading ? "disabled" : ""} />
      ${state.importedImage ? `<img class="import-preview" src="${state.importedImage}" alt="Uploaded Sudoku screenshot preview" />` : ""}
      ${state.importError ? `<p class="caption" data-testid="import-error" role="alert">${escapeHtml(state.importError)}</p>` : ""}
      <p class="caption">Crop closely to one straight-on 9 by 9 grid for best results. Always review every detected filled digit and pencil note before applying the import. Select a review cell, then use Filled value or Pencil notes to correct its type.</p>
      <p class="caption import-disclosure"><strong>Before you scan:</strong> Sudoku Pilot uploads your puzzle image to a paid third-party recognition API. You are never charged. Online scans use a limited shared quota, so recognition may not always be available.</p>
      ${state.importStatus ? `<p class="run-message" data-testid="import-status" role="status">${state.importStatus}</p>` : ""}
      <div class="import-kind-control" role="group" aria-label="Selected review cell type">
        <span data-import-kind-label>${cellName(state.importSelectedCell)} type</span>
        <button type="button" data-import-kind-choice="value" aria-pressed="${state.importCellKinds[state.importSelectedCell] !== "notes"}" class="${state.importCellKinds[state.importSelectedCell] !== "notes" ? "active" : ""}">Filled value</button>
        <button type="button" data-import-kind-choice="notes" aria-pressed="${state.importCellKinds[state.importSelectedCell] === "notes"}" class="${state.importCellKinds[state.importSelectedCell] === "notes" ? "active" : ""}">Pencil notes</button>
      </div>
      <div class="import-grid">
        ${state.importCells.map((value, index) => {
          const kind = state.importCellKinds[index] === "notes" ? "notes" : "value";
          const description = !value ? "empty cell" : kind === "notes" ? "pencil notes" : "filled digit";
          return `<input class="${value ? "has-import-content" : ""}" value="${escapeHtml(value)}" data-import-cell="${index}" data-import-kind="${kind}" maxlength="9" inputmode="numeric" aria-label="Import ${cellName(index)}, ${description}" />`;
        }).join("")}
      </div>
      <div class="tool-row">
        ${state.ocrLoading
          ? `<button data-action="cancel-ocr">Cancel online scan</button>`
          : `<button data-action="ocr-import" ${state.importedFile && !state.ocrScanComplete ? "" : "disabled"}>${state.ocrScanComplete ? "Scan complete" : "Scan online"}</button>`}
        <button class="primary" data-action="apply-import" ${state.ocrLoading ? "disabled" : ""}>Apply Import</button>
      </div>
    </section>
  `;
}

function bindEvents() {
  app.querySelectorAll("[data-cell]").forEach((button) => {
    button.addEventListener("click", () => selectCell(Number(button.dataset.cell)));
  });
  app.querySelectorAll("[data-digit]").forEach((button) => {
    button.addEventListener("click", () => enterDigit(Number(button.dataset.digit)));
  });
  app.querySelectorAll("[data-preference]").forEach((input) => {
    input.addEventListener("change", () => {
      state[input.dataset.preference] = input.checked;
      render();
    });
  });
  const entryMethod = app.querySelector("[data-entry-method]");
  if (entryMethod) entryMethod.addEventListener("change", () => {
    state.entryMethod = entryMethod.value;
    state.selectedDigit = null;
    render();
  });
  app.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => handleAction(button.dataset.action));
  });
  app.querySelectorAll("[data-difficulty]").forEach((button) => {
    button.addEventListener("click", () => {
      startPuzzle(button.dataset.difficulty);
      render();
    });
  });
  app.querySelectorAll("[data-technique]").forEach((input) => {
    input.addEventListener("change", () => {
      if (input.checked) state.allowedTechniques.add(input.dataset.technique);
      else state.allowedTechniques.delete(input.dataset.technique);
      closeHintDetails();
      render();
    });
  });
  app.querySelectorAll("[data-run-technique]").forEach((button) => {
    button.addEventListener("click", () => {
      runOneTechnique(button.dataset.runTechnique);
      render();
    });
  });
  app.querySelectorAll("[data-jump-technique]").forEach((button) => {
    button.addEventListener("click", () => {
      state.hintIndex = state.moves.findIndex((move) => move.technique === button.dataset.jumpTechnique);
      state.hintStage = 4;
      render();
    });
  });
  app.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      state.view = button.dataset.view;
      state.practiceError = "";
      if (state.view === "learn") trackLessonViewed("navigation");
      closeHintDetails();
      render();
    });
  });
  const lessonSelect = app.querySelector("[data-lesson-select]");
  if (lessonSelect) lessonSelect.addEventListener("change", () => {
    selectLesson(lessonSelect.value);
    render();
  });
  const practiceTechnique = app.querySelector("[data-practice-technique]");
  if (practiceTechnique) practiceTechnique.addEventListener("change", () => {
    state.practiceTechnique = practiceTechnique.value;
    clearPracticeSession();
    render();
  });
  app.querySelectorAll(".practice-mode-tabs [data-practice-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      state.practiceMode = button.dataset.practiceMode;
      clearPracticeSession();
      render();
    });
  });
  const fileInput = app.querySelector("[data-import-file]");
  if (fileInput) fileInput.addEventListener("change", onImportFile);
  app.querySelectorAll("[data-import-cell]").forEach((input) => {
    input.addEventListener("focus", () => selectImportReviewCell(Number(input.dataset.importCell)));
    input.addEventListener("input", () => {
      const index = Number(input.dataset.importCell);
      state.importCells[index] = input.value.replace(/[^1-9]/g, "");
      if (state.importCells[index].length > 1) state.importCellKinds[index] = "notes";
      input.value = state.importCells[index];
      syncImportReviewCell(index);
    });
  });
  app.querySelectorAll("[data-import-kind-choice]").forEach((button) => {
    button.addEventListener("click", () => {
      state.importCellKinds[state.importSelectedCell] = button.dataset.importKindChoice;
      syncImportReviewCell(state.importSelectedCell);
    });
  });
  document.onkeydown = handleKeydown;
}

function selectImportReviewCell(index) {
  state.importSelectedCell = index;
  syncImportReviewCell(index);
}

function syncImportReviewCell(index) {
  const kind = state.importCellKinds[index] === "notes" ? "notes" : "value";
  const value = state.importCells[index];
  const input = app.querySelector(`[data-import-cell="${index}"]`);
  if (input) {
    input.dataset.importKind = kind;
    input.classList.toggle("has-import-content", Boolean(value));
    const description = !value ? "empty cell" : kind === "notes" ? "pencil notes" : "filled digit";
    input.setAttribute("aria-label", `Import ${cellName(index)}, ${description}`);
  }
  const label = app.querySelector("[data-import-kind-label]");
  if (label) label.textContent = `${cellName(index)} type`;
  app.querySelectorAll("[data-import-kind-choice]").forEach((button) => {
    const active = button.dataset.importKindChoice === kind;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function handleAction(action) {
  if (action === "undo") undo();
  if (action === "erase") eraseSelected();
  if (action === "toggle-notes") setNumberMode(state.numberMode === "note" ? "value" : "note");
  if (action === "toggle-multi") toggleMultiSelectMode();
  if (action === "toggle-line-counts") state.lineCountsVisible = !state.lineCountsVisible;
  if (action === "fill-notes") fillNotesWithHistory();
  if (action === "clear-notes") clearNotesWithHistory();
  if (action === "new-puzzle") startPuzzle();
  if (action === "new-puzzle-after-completion") {
    if (shouldPromoteInstall()) saveInstallPromotionStatus("offered");
    startPuzzle(state.difficulty, { skipConfirm: true });
  }
  if (action === "practice") openPracticeBrowser();
  if (action === "practice-from-lesson") openPracticeFromLesson();
  if (action === "start-certified-practice" || action === "practice-retry") startCertifiedPractice(state.practiceFixtureIndex);
  if (action === "next-practice-example") startCertifiedPractice(state.practiceFixtureIndex + 1);
  if (action === "practice-next-technique") selectNextPracticeTechnique();
  if (action === "practice-answer-valid") answerNearMiss(true);
  if (action === "practice-answer-invalid") answerNearMiss(false);
  if (action === "back-to-lesson") openCurrentLesson();
  if (action === "previous-lesson") changeLesson(-1);
  if (action === "next-lesson") changeLesson(1);
  if (action === "previous-lesson-stage") state.lessonStage = Math.max(1, state.lessonStage - 1);
  if (action === "next-lesson-stage") state.lessonStage = Math.min(4, state.lessonStage + 1);
  if (action === "select-basic") selectTechniqueSet(BASIC_TECHNIQUES);
  if (action === "select-advanced") selectTechniqueSet([...BASIC_TECHNIQUES, ...ADVANCED_TECHNIQUES]);
  if (action === "select-all") selectTechniqueSet(ALL_TECHNIQUES);
  if (action === "enable-all-techniques") enableAllTechniquesInline();
  if (action === "edit-techniques") openTechniqueSettings();
  if (action === "run-selected") runSelectedTechniques();
  if (action === "hint") requestHint();
  if (action === "show-technique") showTechniqueHint();
  if (action === "show-exact-hint") state.hintStage = 4;
  if (action === "next-hint-stage") state.hintStage = Math.min(4, (state.hintStage || 1) + 1);
  if (action === "previous-hint-stage") state.hintStage = Math.max(1, (state.hintStage || 1) - 1);
  if (action === "toggle-all-moves") toggleAllMoves();
  if (action === "prev-hint") state.hintIndex = Math.max(0, state.hintIndex - 1);
  if (action === "next-hint") state.hintIndex = Math.min(state.moves.length - 1, state.hintIndex + 1);
  if (action === "apply-hint") applyCurrentHint();
  if (action === "close-hint") closeHintDetails();
  if (action === "fix-notes") fixNotes();
  if (action === "toggle-import") {
    state.importOpen = !state.importOpen;
    if (state.importOpen) state.moreOpen = false;
  }
  if (action === "toggle-more") {
    state.moreOpen = !state.moreOpen;
    if (state.moreOpen) state.importOpen = false;
  }
  if (action === "toggle-about") {
    state.aboutOpen = !state.aboutOpen;
    if (state.aboutOpen) {
      state.moreOpen = false;
      state.importOpen = false;
    }
  }
  if (action === "apply-import") applyImport();
  if (action === "ocr-import") tryOcr();
  if (action === "cancel-ocr") cancelOcr();
  if (action === "restore-previous") restorePreviousPuzzle();
  if (action === "clear-local-data") clearLocalData();
  if (action === "save-offline") {
    saveOffline();
    return;
  }
  if (action === "open-install-prompt") {
    openInstallPrompt();
    return;
  }
  if (action === "dismiss-install-prompt") {
    dismissInstallPrompt();
    return;
  }
  if (action === "install-app") {
    installApp();
    return;
  }
  if (action === "dismiss-celebration") {
    dismissCompletionCelebration();
    return;
  }
  render();
}

function handleKeydown(event) {
  if (state.installPromptOpen) {
    if (event.key === "Escape") {
      dismissInstallPrompt();
      return;
    }
    if (event.key === "Tab") {
      const actions = [...app.querySelectorAll("[data-testid='install-prompt'] button, [data-testid='install-prompt'] a")];
      if (!actions.length) return;
      event.preventDefault();
      const current = actions.indexOf(document.activeElement);
      const offset = event.shiftKey ? -1 : 1;
      actions[(current + offset + actions.length) % actions.length].focus();
    }
    return;
  }
  if (state.completionSummary) {
    if (event.key === "Escape") {
      dismissCompletionCelebration();
      return;
    }
    if (event.key === "Tab") {
      const actions = [...app.querySelectorAll("[data-testid='completion-celebration'] button")];
      if (!actions.length) return;
      event.preventDefault();
      const current = actions.indexOf(document.activeElement);
      const offset = event.shiftKey ? -1 : 1;
      actions[(current + offset + actions.length) % actions.length].focus();
    }
    return;
  }
  if (isTextEditingTarget(event.target)) return;
  if (/^[1-9]$/.test(event.key)) enterDigit(Number(event.key));
  if (event.key === "Backspace" || event.key === "Delete" || event.key === "0") eraseSelected();
  if (event.key === "n") {
    setNumberMode(state.numberMode === "note" ? "value" : "note");
    render();
  }
  if (event.key === "ArrowLeft") moveSelection(-1, 0);
  if (event.key === "ArrowRight") moveSelection(1, 0);
  if (event.key === "ArrowUp") moveSelection(0, -1);
  if (event.key === "ArrowDown") moveSelection(0, 1);
}

function setNumberMode(mode) {
  state.numberMode = mode;
  if (state.numberMode === "value") {
    state.multiSelectMode = false;
    state.multiSelected.clear();
  }
}

function enterDigit(digit) {
  if (state.entryMethod === "digit-first" && state.selected === null && !state.multiSelectMode) {
    state.selectedDigit = state.selectedDigit === digit ? null : digit;
    render();
    return;
  }
  if (state.multiSelectMode) {
    toggleMultiNote(digit);
    return;
  }
  if (state.selected === null || state.puzzle.givens[state.selected]) return;
  if (state.numberMode === "note" && state.puzzle.values[state.selected]) return;
  if (state.numberMode === "value" && state.puzzle.values[state.selected] === digit) return;
  state.runMessage = "";
  pushHistory(clonePuzzle(state.puzzle));
  if (state.numberMode === "note") {
    const notes = state.puzzle.notes[state.selected];
    if (notes.has(digit)) notes.delete(digit);
    else notes.add(digit);
    puzzleJourney.recordInteraction();
  } else {
    state.puzzleMoveCount += 1;
    state.puzzle.values[state.selected] = digit;
    state.puzzle.notes[state.selected].clear();
    puzzleJourney.recordMove(state.puzzleMoveCount);
    for (let index = 0; index < 81; index += 1) {
      if (sameBox(index, state.selected) || rowOf(index) === rowOf(state.selected) || colOf(index) === colOf(state.selected)) {
        state.puzzle.notes[index].delete(digit);
      }
    }
  }
  closeHintDetails();
  render();
}

function selectCell(index) {
  if (state.multiSelectMode) {
    toggleMultiCell(index);
    render();
    return;
  }
  if (state.entryMethod === "digit-first" && state.selectedDigit && !state.puzzle.givens[index]) {
    state.selected = index;
    enterDigit(state.selectedDigit);
    state.selected = null;
    render();
    return;
  }
  state.selected = state.selected === index ? null : index;
  render();
}

function toggleMultiSelectMode() {
  state.multiSelectMode = !state.multiSelectMode;
  state.selected = null;
  if (state.multiSelectMode) {
    state.numberMode = "note";
  } else {
    state.multiSelected.clear();
  }
  state.runMessage = state.multiSelectMode ? "Select cells, then tap a note number." : "";
}

function toggleMultiCell(index) {
  if (state.puzzle.givens[index] || state.puzzle.values[index]) {
    state.multiSelectMode = false;
    state.multiSelected.clear();
    state.selected = index;
    state.runMessage = "";
    closeHintDetails();
    return;
  }
  if (state.multiSelected.has(index)) state.multiSelected.delete(index);
  else state.multiSelected.add(index);
  state.runMessage = state.multiSelected.size ? `${state.multiSelected.size} cell${state.multiSelected.size === 1 ? "" : "s"} selected for notes.` : "Select cells, then tap a note number.";
  closeHintDetails();
}

function toggleMultiNote(digit) {
  const cells = [...state.multiSelected].filter((index) => !state.puzzle.givens[index] && !state.puzzle.values[index]);
  if (!cells.length) {
    state.runMessage = "Select at least two empty cells first.";
    render();
    return;
  }
  pushHistory(clonePuzzle(state.puzzle));
  const shouldRemove = cells.every((index) => state.puzzle.notes[index].has(digit));
  let changed = 0;
  for (const index of cells) {
    const notes = state.puzzle.notes[index];
    if (shouldRemove) {
      if (notes.delete(digit)) changed += 1;
    } else if (!notes.has(digit)) {
      notes.add(digit);
      changed += 1;
    }
  }
  state.runMessage = `${shouldRemove ? "Removed" : "Added"} ${digit} ${shouldRemove ? "from" : "to"} ${changed} selected cell${changed === 1 ? "" : "s"}.`;
  if (changed > 0) puzzleJourney.recordInteraction();
  closeHintDetails();
  render();
}

function eraseSelected() {
  if (state.selected === null || state.puzzle.givens[state.selected]) return;
  state.runMessage = "";
  pushHistory(clonePuzzle(state.puzzle));
  state.puzzle.values[state.selected] = 0;
  state.puzzle.notes[state.selected].clear();
  closeHintDetails();
  render();
}

function undo() {
  const last = state.puzzle.history.pop();
  if (!last) return;
  const history = state.puzzle.history;
  state.puzzle = last;
  state.puzzle.history = history;
  state.completionSummary = null;
  syncPracticeProgress();
  state.runMessage = "Undid last change.";
  closeHintDetails();
}

function pushHistory(snapshot) {
  state.puzzle.history.push(snapshot);
  if (state.puzzle.history.length > MAX_HISTORY) state.puzzle.history.splice(0, state.puzzle.history.length - MAX_HISTORY);
}

function fillNotesWithHistory() {
  pushHistory(clonePuzzle(state.puzzle));
  fillAllNotes(state.puzzle);
  state.runMessage = "Filled all legal pencil notes.";
  closeHintDetails();
}

function clearNotesWithHistory() {
  pushHistory(clonePuzzle(state.puzzle));
  state.puzzle.notes = state.puzzle.notes.map(() => new Set());
  state.runMessage = "Cleared all pencil notes.";
  closeHintDetails();
}

function startPuzzle(difficulty = state.difficulty, { skipConfirm = false } = {}) {
  if (!skipConfirm && hasPlayerProgress() && !window.confirm("Start a new puzzle? Your current progress will be lost.")) {
    return;
  }
  state.difficulty = difficulty;
  state.puzzle = createFreshPuzzle(difficulty);
  state.selected = null;
  state.multiSelected.clear();
  state.multiSelectMode = false;
  state.moreOpen = false;
  state.importOpen = false;
  state.runMessage = `Started a new ${difficulty} puzzle.`;
  resetPuzzleStats();
  startTrackedPuzzle("generated");
  resetTimer();
  closeHintDetails();
}

function hasPlayerProgress() {
  if (state.puzzle.history?.length) return true;
  return state.puzzle.values.some((value, index) => value && !state.puzzle.givens[index]) || state.puzzle.notes.some((notes) => notes.size);
}

function openPracticeBrowser() {
  state.view = "practice";
  state.practiceTechnique = [...state.allowedTechniques].find((technique) => COMMITTED_COACHING_TECHNIQUES.includes(technique)) || state.practiceTechnique;
  clearPracticeSession();
}

function openPracticeFromLesson() {
  state.practiceTechnique = state.lessonTechnique;
  state.practiceMode = "find-pattern";
  state.view = "practice";
  startCertifiedPractice(0);
}

function startCertifiedPractice(index = 0) {
  try {
    if (window.__SUDOKU_FORCE_PRACTICE_FAILURE__) {
      window.__SUDOKU_FORCE_PRACTICE_FAILURE__ = false;
      throw new Error("The certified fixture could not be loaded. Your puzzle was not changed.");
    }
    const session = createPracticeState(state.practiceTechnique, state.practiceMode, index);
    session.targetApplied = false;
    state.practiceSession = session;
    state.practiceFixtureIndex = session.fixtureIndex;
    state.practiceAnswer = null;
    state.practiceError = "";
    state.previousPuzzle = snapshotCurrentPuzzle();
    state.puzzle = clonePuzzle(session.puzzle);
    state.selected = null;
    state.multiSelected.clear();
    state.multiSelectMode = false;
    state.moreOpen = false;
    state.importOpen = false;
    state.runMessage = `${session.technique} practice example ready.`;
    resetPuzzleStats();
    state.puzzleSource = "practice";
    productAnalytics.capture("practice_started", {
      technique: session.technique,
      practice_mode: session.mode,
      fixture_index: session.fixtureIndex
    });
    if (session.mode !== "near-miss") startTrackedPuzzle("practice");
    resetTimer();
    closeHintDetails();
  } catch (error) {
    state.practiceSession = null;
    state.practiceAnswer = null;
    state.practiceError = error.message || "The certified practice example could not be loaded.";
  }
}

function answerNearMiss(answer) {
  if (!state.practiceSession || state.practiceSession.mode !== "near-miss") return;
  state.practiceAnswer = answer;
  productAnalytics.capture("practice_answered", {
    technique: state.practiceSession.technique,
    practice_mode: state.practiceSession.mode,
    correct: answer === state.practiceSession.nearMiss.valid
  });
}

function selectNextPracticeTechnique() {
  const index = COMMITTED_COACHING_TECHNIQUES.indexOf(state.practiceTechnique);
  state.practiceTechnique = COMMITTED_COACHING_TECHNIQUES[(index + 1) % COMMITTED_COACHING_TECHNIQUES.length];
  clearPracticeSession();
}

function openCurrentLesson() {
  state.lessonTechnique = state.practiceTechnique;
  state.lessonStage = 1;
  state.view = "learn";
  state.practiceError = "";
  trackLessonViewed("practice_return");
  closeHintDetails();
}

function selectLesson(technique) {
  if (!COMMITTED_COACHING_TECHNIQUES.includes(technique)) return;
  state.lessonTechnique = technique;
  state.lessonStage = 1;
  trackLessonViewed("lesson_selector");
}

function trackLessonViewed(entryPoint) {
  if (viewedLessons.has(state.lessonTechnique)) return;
  viewedLessons.add(state.lessonTechnique);
  productAnalytics.capture("lesson_viewed", {
    technique: state.lessonTechnique,
    entry_point: entryPoint
  });
}

function changeLesson(offset) {
  const current = COMMITTED_COACHING_TECHNIQUES.indexOf(state.lessonTechnique);
  selectLesson(COMMITTED_COACHING_TECHNIQUES[Math.max(0, Math.min(COMMITTED_COACHING_TECHNIQUES.length - 1, current + offset))]);
}

function clearPracticeSession() {
  state.practiceSession = null;
  state.practiceAnswer = null;
  state.practiceError = "";
  closeHintDetails();
}

function requestHint() {
  if (isHintOpen()) {
    closeHintDetails();
    state.runMessage = "";
    return;
  }
  const check = checkBoard();
  state.hintRequested = true;
  puzzleJourney.recordHint({
    board_status: check.status,
    technique: state.moves[state.hintIndex]?.technique || "note-diagnosis",
    stage: 1
  });
  if (check.status !== "ok") {
    state.runMessage = "Fix the board issue before asking for a hint.";
    return;
  }
  state.hintMode = "coach";
  state.allMovesVisible = false;
  state.skipNoteDiagnosis = false;
  state.hintStage = 1;
  state.runMessage = "";
  state.focusHint = true;
}

function showTechniqueHint() {
  state.hintMode = "coach";
  state.allMovesVisible = false;
  state.skipNoteDiagnosis = true;
  state.hintStage = 1;
}

function toggleAllMoves() {
  state.allMovesVisible = !state.allMovesVisible;
  state.hintMode = state.allMovesVisible ? "closed" : "coach";
  state.skipNoteDiagnosis = state.allMovesVisible;
  state.hintStage = state.allMovesVisible ? 4 : 1;
}

function closeHintDetails() {
  state.hintMode = "closed";
  state.allMovesVisible = false;
  state.skipNoteDiagnosis = false;
  state.hintIndex = 0;
  state.hintStage = 1;
  state.focusHint = false;
}

function isHintOpen() {
  return state.hintMode !== "closed" || state.allMovesVisible;
}

function focusRequestedHint() {
  if (!state.focusHint) return;
  state.focusHint = false;
  window.requestAnimationFrame(() => {
    app.querySelector("[data-testid='hint-panel']")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  });
}

function applyCurrentHint() {
  const check = checkBoard();
  if (check.status !== "ok") {
    state.runMessage = "Fix the board issue before applying a hint.";
    return;
  }
  const move = state.moves[state.hintIndex];
  if (move) {
    applyMove(state.puzzle, move);
    state.puzzleMoveCount += (move.fills || []).length;
    puzzleJourney.recordMove(state.puzzleMoveCount);
    state.hintCount += 1;
    if (state.practiceSession && sameMoveAction(move, state.practiceSession.targetMove)) state.practiceSession.targetApplied = true;
    state.runMessage = `Applied ${move.technique}: ${move.title}.`;
  }
  closeHintDetails();
}

function syncPracticeProgress() {
  if (!state.practiceSession) return;
  state.practiceSession.targetApplied = !findAllMoves(state.puzzle, [state.practiceSession.technique])
    .some((move) => sameMoveAction(move, state.practiceSession.targetMove));
}

function sameMoveAction(a, b) {
  const parts = (move) => [
    move.technique,
    ...(move.fills || []).map(({ index, digit }) => `f${index}-${digit}`).sort(),
    ...(move.eliminations || []).map(({ index, digit }) => `e${index}-${digit}`).sort()
  ].join("|");
  return parts(a) === parts(b);
}

function runSelectedTechniques() {
  const check = checkBoard();
  if (check.status !== "ok") {
    state.runMessage = "Fix the board issue before running techniques.";
    return;
  }
  const allowed = [...state.allowedTechniques];
  if (!allowed.length) {
    state.runMessage = "Select at least one technique to run.";
    return;
  }
  const applied = applySelectedTechniques(state.puzzle, allowed);
  if (!applied.length) {
    state.runMessage = "No selected techniques can move this board forward.";
    return;
  }
  state.puzzleMoveCount += applied.reduce((total, move) => total + (move.fills || []).length, 0);
  puzzleJourney.recordMove(state.puzzleMoveCount);
  state.hintCount += 1;
  const counts = groupMoves(applied).map(([technique, count]) => `${count} ${technique}`).join(", ");
  state.runMessage = `Applied ${applied.length} move${applied.length === 1 ? "" : "s"}: ${counts}.`;
  closeHintDetails();
}

function runOneTechnique(technique) {
  const check = checkBoard();
  if (check.status !== "ok") {
    state.runMessage = `Fix the board issue before running ${technique}.`;
    return;
  }
  const applied = applySelectedTechniques(state.puzzle, [technique]);
  if (applied.length) {
    state.puzzleMoveCount += applied.reduce((total, move) => total + (move.fills || []).length, 0);
    puzzleJourney.recordMove(state.puzzleMoveCount);
    state.hintCount += 1;
  }
  state.runMessage = applied.length ? `Applied ${applied.length} ${technique} move${applied.length === 1 ? "" : "s"}.` : `${technique} cannot move this board right now.`;
  closeHintDetails();
}

function applyImport() {
  const candidate = puzzleFromImportCells();
  const validation = validatePuzzle(candidate);
  if (!validation.ok) {
    state.importStatus = validation.message;
    return;
  }
  if (hasPlayerProgress() && !window.confirm("Import this puzzle? Your current progress can be restored afterwards.")) return;
  state.previousPuzzle = snapshotCurrentPuzzle();
  state.puzzle = candidate;
  state.selected = null;
  state.multiSelected.clear();
  state.multiSelectMode = false;
  state.importOpen = false;
  state.moreOpen = false;
  state.importStatus = "";
  state.runMessage = "Imported puzzle.";
  resetPuzzleStats();
  startTrackedPuzzle("import");
  productAnalytics.capture("screenshot_review_confirmed", {
    input_method: state.importedFile ? "screenshot" : "manual",
    filled_cells: candidate.values.filter(Boolean).length,
    note_cells: candidate.notes.filter((notes) => notes.size).length
  });
  resetTimer();
  closeHintDetails();
}

function puzzleFromImportCells() {
  const values = Array(81).fill(0);
  const notes = Array.from({ length: 81 }, () => new Set());
  for (let index = 0; index < 81; index += 1) {
    const unique = [...new Set((state.importCells[index] || "").split("").map(Number).filter(Boolean))];
    if (unique.length === 1 && state.importCellKinds[index] !== "notes") values[index] = unique[0];
    if (unique.length > 1 || (unique.length === 1 && state.importCellKinds[index] === "notes")) notes[index] = new Set(unique);
  }
  return {
    values,
    givens: values.map(Boolean),
    notes,
    eliminated: Array.from({ length: 81 }, () => new Set()),
    history: [],
    solution: null
  };
}

function validatePuzzle(puzzle) {
  for (const unit of getUnitsForCheck()) {
    const digits = unit.cells.map((index) => puzzle.values[index]).filter(Boolean);
    if (new Set(digits).size !== digits.length) return { ok: false, message: `${unit.label} conflicts with Sudoku rules. Correct the review grid before importing.` };
  }
  return { ok: true };
}

function restorePreviousPuzzle() {
  if (!state.previousPuzzle) return;
  const previous = state.previousPuzzle;
  state.puzzle = previous.puzzle;
  state.elapsedBeforeStart = previous.elapsedBeforeStart;
  state.startedAt = Date.now();
  state.puzzleMoveCount = previous.puzzleMoveCount;
  state.hintCount = previous.hintCount;
  state.hintRequested = previous.hintRequested;
  state.puzzleSource = previous.puzzleSource;
  state.puzzlePracticeTechnique = previous.puzzlePracticeTechnique;
  state.puzzlePracticeMode = previous.puzzlePracticeMode;
  state.completionRecorded = previous.completionRecorded;
  state.completionSummary = null;
  state.wasSolved = previous.wasSolved;
  state.previousPuzzle = null;
  state.runMessage = "Restored your previous puzzle.";
  puzzleJourney.resume(puzzleAnalyticsContext(), state.puzzleMoveCount, hasPlayerProgress() || state.hintRequested);
  productAnalytics.capture("puzzle_resumed", {
    ...puzzleAnalyticsContext(),
    existing_moves: state.puzzleMoveCount
  });
}

function snapshotCurrentPuzzle() {
  return {
    puzzle: clonePuzzle(state.puzzle),
    elapsedBeforeStart: elapsedSeconds(),
    puzzleMoveCount: state.puzzleMoveCount,
    hintCount: state.hintCount,
    hintRequested: state.hintRequested,
    puzzleSource: state.puzzleSource,
    puzzlePracticeTechnique: state.puzzlePracticeTechnique,
    puzzlePracticeMode: state.puzzlePracticeMode,
    completionRecorded: state.completionRecorded,
    wasSolved: state.wasSolved
  };
}

function clearLocalData() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    window.localStorage.removeItem(PLAYED_PUZZLES_KEY);
    window.localStorage.removeItem(PLAYER_STATS_KEY);
    productAnalytics.reset();
    clearInstallPromotionStatus();
    playedCanonicalIds.clear();
    const freshState = createInitialState();
    window.localStorage.removeItem(PLAYED_PUZZLES_KEY);
    playedCanonicalIds.clear();
    for (const key of Object.keys(state)) delete state[key];
    Object.assign(state, freshState);
    puzzleJourney.resume(puzzleAnalyticsContext(), 0);
    state.runMessage = "Cleared locally saved puzzle data.";
  } catch {
    state.runMessage = "Could not clear local data. Your browser blocked storage access.";
  }
}

function puzzleAnalyticsContext() {
  return {
    difficulty: state.puzzleSource === "import" ? "custom" : state.difficulty,
    source: state.puzzleSource,
    ...(state.puzzleSource === "practice" ? {
      ...(state.puzzlePracticeTechnique ? { practice_technique: state.puzzlePracticeTechnique } : {}),
      ...(state.puzzlePracticeMode ? { practice_mode: state.puzzlePracticeMode } : {})
    } : {})
  };
}

function startTrackedPuzzle(source) {
  state.puzzleSource = source;
  state.puzzlePracticeTechnique = source === "practice" ? state.practiceTechnique : null;
  state.puzzlePracticeMode = source === "practice" ? state.practiceMode : null;
  puzzleJourney.start(puzzleAnalyticsContext());
}

function resetPuzzleStats() {
  state.puzzleMoveCount = 0;
  state.hintCount = 0;
  state.hintRequested = false;
  state.completionRecorded = false;
  state.completionSummary = null;
  state.wasSolved = isSolved(state.puzzle.values);
}

function checkBoard({ revealSolutionMistakes = true } = {}) {
  const issues = new Set();
  const details = [];
  for (const unit of getUnitsForCheck()) {
    const seen = new Map();
    for (const index of unit.cells) {
      const value = state.puzzle.values[index];
      if (!value) continue;
      if (!seen.has(value)) seen.set(value, []);
      seen.get(value).push(index);
    }
    for (const [digit, cells] of seen.entries()) {
      if (cells.length > 1) {
        cells.forEach((cell) => issues.add(cell));
        details.push(`${unit.label} has multiple ${digit}s.`);
      }
    }
  }
  if (revealSolutionMistakes && state.puzzle.solution) {
    for (let index = 0; index < 81; index += 1) {
      const value = state.puzzle.values[index];
      if (value && value !== state.puzzle.solution[index]) {
        issues.add(index);
        details.push(`${cellName(index)} should not be ${value}.`);
      }
    }
  }
  for (let index = 0; index < 81; index += 1) {
    if (!state.puzzle.values[index] && legalCandidates(state.puzzle.values, index).size === 0) {
      issues.add(index);
      details.push(`${cellName(index)} has no legal candidates left.`);
    }
  }
  state.boardIssues = issues;
  if (!details.length) return { status: "ok", message: "Board looks valid.", details: [] };
  return {
    status: "error",
    message: "Something on the board conflicts with Sudoku rules. Fix the highlighted cell or note issue before hints and techniques can continue.",
    details: [...new Set(details)]
  };
}

function diagnoseNotes() {
  const corrections = [];
  let emptyWithoutNotes = 0;
  for (let index = 0; index < 81; index += 1) {
    if (state.puzzle.values[index]) continue;
    const legal = legalCandidates(state.puzzle.values, index);
    const notes = state.puzzle.notes[index];
    if (!notes.size) emptyWithoutNotes += 1;
    for (const digit of notes) {
      if (!legal.has(digit)) corrections.push({ index, digit });
    }
  }
  if (corrections.length) {
    return { type: "mistake", corrections, message: `I found ${corrections.length} pencil note correction${corrections.length === 1 ? "" : "s"} before the next technique.` };
  }
  if (emptyWithoutNotes) {
    return { type: "missing", corrections: [], message: `${emptyWithoutNotes} open cell${emptyWithoutNotes === 1 ? " is" : "s are"} missing pencil notes. Fill all notes first, or show the next technique anyway.` };
  }
  return { type: "ready", corrections: [], message: "Notes look ready." };
}

function fixNotes() {
  const diagnosis = diagnoseNotes();
  if (diagnosis.type !== "mistake") return;
  pushHistory(clonePuzzle(state.puzzle));
  for (const correction of diagnosis.corrections) {
    state.puzzle.notes[correction.index].delete(correction.digit);
  }
  state.runMessage = `Fixed ${diagnosis.corrections.length} pencil note issue${diagnosis.corrections.length === 1 ? "" : "s"}.`;
  showTechniqueHint();
}

function selectTechniqueSet(techniques) {
  state.allowedTechniques = new Set(techniques);
  closeHintDetails();
}

function enableAllTechniquesInline() {
  state.allowedTechniques = new Set(ALL_TECHNIQUES);
  if (state.view === "practice" && state.practiceSession) state.practiceSession.hintUsesAllTechniques = true;
  state.runMessage = "Hints now search all techniques.";
  state.hintMode = "coach";
  state.hintStage = 1;
  state.skipNoteDiagnosis = true;
  state.focusHint = true;
}

function openTechniqueSettings() {
  state.moreOpen = true;
  state.importOpen = false;
  state.runMessage = "Technique settings are open.";
}

function onImportFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  state.importError = "";
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    state.importedImage = null;
    state.importedFile = null;
    state.ocrScanComplete = false;
    state.importError = "Choose a PNG, JPEG, or WebP screenshot.";
    state.importStatus = "Your review entries are preserved, but choose a valid image before scanning.";
    render();
    return;
  }
  if (file.size > MAX_IMAGE_BYTES) {
    state.importedImage = null;
    state.importedFile = null;
    state.ocrScanComplete = false;
    state.importError = "Choose an image that is 4 MB or smaller.";
    state.importStatus = "Your review entries are preserved, but choose a valid image before scanning.";
    render();
    return;
  }
  state.ocrScanComplete = false;
  state.importedImage = null;
  state.importedFile = null;
  state.importCells = Array.from({ length: 81 }, () => "");
  state.importCellKinds = Array.from({ length: 81 }, () => "value");
  state.importSelectedCell = 0;
  state.importStatus = "Loading screenshot for review…";
  render();
  const reader = new FileReader();
  reader.onload = () => {
    state.importedFile = file;
    state.importedImage = reader.result;
    state.ocrScanComplete = false;
    state.importStatus = "Screenshot ready. Review the upload disclosure, then choose Scan online to send this image for recognition.";
    productAnalytics.capture("screenshot_import_selected", {
      image_type: file.type,
      size_kb_bucket: Math.min(5000, Math.ceil(file.size / 100000) * 100)
    });
    render();
  };
  reader.readAsDataURL(file);
}

function createInitialState() {
  const defaultDifficulty = "extreme";
  const fallback = {
    puzzle: createFreshPuzzle(defaultDifficulty),
    view: "play",
    lessonTechnique: "Hidden Pair",
    lessonStage: 1,
    practiceTechnique: COMMITTED_COACHING_TECHNIQUES[0],
    practiceMode: "find-pattern",
    practiceFixtureIndex: 0,
    practiceSession: null,
    practiceAnswer: null,
    practiceError: "",
    selected: null,
    multiSelected: new Set(),
    multiSelectMode: false,
    numberMode: "value",
    difficulty: defaultDifficulty,
    allowedTechniques: new Set(ALL_TECHNIQUES),
    moves: [],
    hintIndex: 0,
    hintMode: "closed",
    hintStage: 1,
    allMovesVisible: false,
    skipNoteDiagnosis: false,
    lineCountsVisible: false,
    showMistakes: false,
    showTimer: false,
    highlightPeers: true,
    highlightMatches: true,
    entryMethod: "cell-first",
    selectedDigit: null,
    startedAt: Date.now(),
    elapsedBeforeStart: 0,
    puzzleMoveCount: 0,
    hintCount: 0,
    hintRequested: false,
    puzzleSource: "generated",
    puzzlePracticeTechnique: null,
    puzzlePracticeMode: null,
    completionRecorded: false,
    completionSummary: null,
    installPromptOpen: false,
    wasSolved: false,
    playerStats: loadPlayerStats(),
    focusHint: false,
    importOpen: false,
    aboutOpen: false,
    moreOpen: false,
    runMessage: "",
    coachMessage: "",
    importedImage: null,
    importedFile: null,
    importError: "",
    importCells: Array.from({ length: 81 }, () => ""),
    importCellKinds: Array.from({ length: 81 }, () => "value"),
    importSelectedCell: 0,
    importStatus: "",
    ocrLoading: false,
    ocrAbortController: null,
    ocrScanComplete: false,
    ocrRequestId: null,
    previousPuzzle: null
  };
  fallback.wasSolved = isSolved(fallback.puzzle.values);
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY) || window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return fallback;
    const saved = JSON.parse(raw);
    const puzzle = deserializePuzzle(saved.puzzle);
    if (!puzzle) return fallback;
    const savedTechniques = saved.techniqueDefaultsVersion === TECHNIQUE_DEFAULTS_VERSION && Array.isArray(saved.allowedTechniques)
      ? saved.allowedTechniques
      : ALL_TECHNIQUES;
    return {
      ...fallback,
      puzzle,
      selected: typeof saved.selected === "number" ? saved.selected : null,
      numberMode: saved.numberMode === "note" ? "note" : "value",
      difficulty: DIFFICULTY_ORDER.includes(saved.difficulty) ? saved.difficulty : defaultDifficulty,
      allowedTechniques: new Set(savedTechniques.filter((technique) => ALL_TECHNIQUES.includes(technique))),
      practiceTechnique: COMMITTED_COACHING_TECHNIQUES.includes(saved.practiceTechnique) ? saved.practiceTechnique : fallback.practiceTechnique,
      practiceMode: PRACTICE_MODES.some(({ id }) => id === saved.practiceMode) ? saved.practiceMode : fallback.practiceMode,
      lineCountsVisible: Boolean(saved.lineCountsVisible),
      showMistakes: Boolean(saved.showMistakes),
      showTimer: Boolean(saved.showTimer),
      highlightPeers: saved.highlightPeers !== false,
      highlightMatches: saved.highlightMatches !== false,
      entryMethod: saved.entryMethod === "digit-first" ? "digit-first" : "cell-first",
      startedAt: Number(saved.startedAt) || Date.now(),
      elapsedBeforeStart: Number(saved.elapsedBeforeStart) || 0,
      puzzleMoveCount: Math.max(0, Number(saved.puzzleMoveCount) || 0),
      hintCount: Math.max(0, Number(saved.hintCount) || 0),
      hintRequested: Boolean(saved.hintRequested),
      puzzleSource: ["generated", "import", "practice"].includes(saved.puzzleSource) ? saved.puzzleSource : "generated",
      puzzlePracticeTechnique: COMMITTED_COACHING_TECHNIQUES.includes(saved.puzzlePracticeTechnique) ? saved.puzzlePracticeTechnique : null,
      puzzlePracticeMode: PRACTICE_MODES.some(({ id }) => id === saved.puzzlePracticeMode) ? saved.puzzlePracticeMode : null,
      completionRecorded: Boolean(saved.completionRecorded),
      wasSolved: isSolved(puzzle.values),
      runMessage: saved.runMessage || "",
      importCells: Array.isArray(saved.importCells) && saved.importCells.length === 81 ? saved.importCells : fallback.importCells,
      importCellKinds: Array.isArray(saved.importCellKinds) && saved.importCellKinds.length === 81
        ? saved.importCellKinds.map((kind) => kind === "notes" ? "notes" : "value")
        : fallback.importCellKinds
    };
  } catch {
    return fallback;
  }
}

function saveState() {
  try {
    const payload = {
      puzzle: serializePuzzle(state.puzzle),
      selected: state.selected,
      numberMode: state.numberMode,
      difficulty: state.difficulty,
      techniqueDefaultsVersion: TECHNIQUE_DEFAULTS_VERSION,
      allowedTechniques: [...state.allowedTechniques],
      lineCountsVisible: state.lineCountsVisible,
      showMistakes: state.showMistakes,
      showTimer: state.showTimer,
      highlightPeers: state.highlightPeers,
      highlightMatches: state.highlightMatches,
      entryMethod: state.entryMethod,
      startedAt: state.startedAt,
      elapsedBeforeStart: state.elapsedBeforeStart,
      puzzleMoveCount: state.puzzleMoveCount,
      hintCount: state.hintCount,
      hintRequested: state.hintRequested,
      puzzleSource: state.puzzleSource,
      puzzlePracticeTechnique: state.puzzlePracticeTechnique,
      puzzlePracticeMode: state.puzzlePracticeMode,
      practiceTechnique: state.practiceTechnique,
      practiceMode: state.practiceMode,
      completionRecorded: state.completionRecorded,
      runMessage: state.runMessage,
      importCells: state.importCells,
      importCellKinds: state.importCellKinds
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    state.runMessage = "Progress could not be saved locally. Your browser storage is unavailable.";
  }
}

function loadPlayerStats() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(PLAYER_STATS_KEY) || "null");
    return { completed: Math.max(0, Number(saved?.completed) || 0) };
  } catch {
    return { completed: 0 };
  }
}

function savePlayerStats() {
  try {
    window.localStorage.setItem(PLAYER_STATS_KEY, JSON.stringify(state.playerStats));
  } catch {
    // Puzzle progress still saves through the primary state store when available.
  }
}

function elapsedSeconds() {
  if (isSolved(state.puzzle.values)) return state.elapsedBeforeStart;
  return runningElapsedSeconds();
}

function runningElapsedSeconds() {
  return state.elapsedBeforeStart + Math.max(0, Math.floor((Date.now() - state.startedAt) / 1000));
}

function formatElapsed(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}` : `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function startTimer() {
  if (timerInterval) window.clearInterval(timerInterval);
  timerInterval = window.setInterval(() => {
    if (!state.showTimer || isSolved(state.puzzle.values)) return;
    const timer = app.querySelector("[data-testid='timer']");
    if (timer) timer.textContent = formatElapsed(elapsedSeconds());
  }, 1000);
}

function resetTimer() {
  state.startedAt = Date.now();
  state.elapsedBeforeStart = 0;
}

function serializePuzzle(puzzle) {
  return {
    values: puzzle.values,
    givens: puzzle.givens,
    notes: puzzle.notes.map((noteSet) => [...noteSet]),
    eliminated: puzzle.eliminated.map((candidateSet) => [...candidateSet]),
    solution: puzzle.solution,
    history: (puzzle.history || []).slice(-MAX_PERSISTED_HISTORY).map((snapshot) => ({
      values: snapshot.values,
      givens: snapshot.givens,
      notes: snapshot.notes.map((noteSet) => [...noteSet]),
      eliminated: snapshot.eliminated.map((candidateSet) => [...candidateSet]),
      solution: snapshot.solution || null
    }))
  };
}

function deserializePuzzle(saved) {
  if (!saved || !Array.isArray(saved.values) || saved.values.length !== 81) return null;
  return {
    values: saved.values.map((value) => Number(value) || 0),
    givens: Array.isArray(saved.givens) && saved.givens.length === 81 ? saved.givens.map(Boolean) : saved.values.map((value) => Boolean(value)),
    notes: Array.isArray(saved.notes) && saved.notes.length === 81 ? saved.notes.map((notes) => new Set((notes || []).map(Number).filter(Boolean))) : Array.from({ length: 81 }, () => new Set()),
    eliminated: Array.isArray(saved.eliminated) && saved.eliminated.length === 81 ? saved.eliminated.map((digits) => new Set((digits || []).map(Number).filter(Boolean))) : Array.from({ length: 81 }, () => new Set()),
    solution: Array.isArray(saved.solution) && saved.solution.length === 81 ? saved.solution.map((value) => Number(value) || 0) : null,
    history: Array.isArray(saved.history) ? saved.history.slice(-MAX_HISTORY).map((snapshot) => ({
      values: Array.isArray(snapshot.values) ? snapshot.values.map((value) => Number(value) || 0) : Array(81).fill(0),
      givens: Array.isArray(snapshot.givens) ? snapshot.givens.map(Boolean) : Array(81).fill(false),
      notes: Array.isArray(snapshot.notes) ? snapshot.notes.map((notes) => new Set((notes || []).map(Number).filter(Boolean))) : Array.from({ length: 81 }, () => new Set()),
      eliminated: Array.isArray(snapshot.eliminated) ? snapshot.eliminated.map((digits) => new Set((digits || []).map(Number).filter(Boolean))) : Array.from({ length: 81 }, () => new Set()),
      solution: Array.isArray(snapshot.solution) ? snapshot.solution.map((value) => Number(value) || 0) : null,
      history: []
    })) : []
  };
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Offline support is additive; failed registration should not block solving.
    });
  });
}

function registerInstallEvents() {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    if (state.completionSummary || state.moreOpen) render();
  });
  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    saveInstallPromotionStatus("installed");
    state.installPromptOpen = false;
    render();
  });
}

function tryOcr() {
  if (!state.importedFile) {
    state.importError = "Choose a screenshot before trying OCR.";
    render();
    return;
  }
  if (state.ocrScanComplete) {
    state.importStatus = "This screenshot has already been scanned. Choose it again if you intentionally want to rescan it.";
    render();
    return;
  }
  if (!navigator.onLine) {
    state.importError = "OCR requires an internet connection to start. Manual review remains available offline.";
    state.importStatus = "Manual import is available offline.";
    render();
    return;
  }
  runOcr();
}

async function runOcr() {
  const requestId = Symbol("ocr");
  const abortController = new AbortController();
  state.ocrRequestId = requestId;
  state.ocrAbortController = abortController;
  state.ocrLoading = true;
  state.importError = "";
  state.importStatus = "Uploading and reading screenshot with online recognition…";
  productAnalytics.capture("screenshot_ocr_started", {
    image_type: state.importedFile.type
  });
  render();
  try {
    const response = await requestSudokuOcr(state.importedFile, abortController.signal);
    if (state.ocrRequestId !== requestId) return;
    const review = importReviewFromOcrResponse(response);
    state.importCells = review.values;
    state.importCellKinds = review.kinds;
    state.ocrScanComplete = true;
    state.importStatus = "Online recognition completed. Review every detected filled digit and pencil note before applying the import.";
    productAnalytics.capture("screenshot_ocr_completed", {
      detected_cells: review.values.filter(Boolean).length,
      detected_value_cells: review.kinds.filter((kind, index) => kind === "value" && review.values[index]).length,
      detected_note_cells: review.kinds.filter((kind, index) => kind === "notes" && review.values[index]).length
    });
  } catch (error) {
    if (state.ocrRequestId !== requestId) return;
    if (error?.name !== "AbortError") {
      state.importError = error.message || "Online recognition could not read this screenshot. Try a clearer image or fill the review grid manually.";
      state.importStatus = "The review grid remains available for manual import.";
    }
    productAnalytics.capture("screenshot_ocr_failed", {
      failure_type: error?.name || "Error"
    });
  } finally {
    if (state.ocrRequestId === requestId) {
      state.ocrLoading = false;
      state.ocrAbortController = null;
      render();
    }
  }
}

async function requestSudokuOcr(imageFile, signal) {
  const response = await fetch("/api/sudoku-ocr", {
    method: "POST",
    headers: {
      "Content-Type": imageFile.type
    },
    body: imageFile,
    signal
  });
  if (response.ok) return response.json();

  let serverMessage = "";
  try {
    const payload = await response.json();
    serverMessage = typeof payload?.error === "string" ? payload.error : "";
  } catch {
    // A generic status-based message is safer than assuming an error response shape.
  }
  if (response.status === 429) throw new Error("The shared online scan quota is temporarily exhausted. Review the grid manually or try again later.");
  if (response.status === 503) throw new Error("Online recognition is temporarily unavailable. Review the grid manually or try again later.");
  throw new Error(serverMessage || "Online recognition could not process this image. Review the grid manually or try again.");
}

function importReviewFromOcrResponse(payload) {
  const rows = payload?.puzzle?.cells;
  if (!Array.isArray(rows) || rows.length !== 9 || rows.some((row) => !Array.isArray(row) || row.length !== 9)) {
    throw new Error("Online recognition returned an invalid puzzle. Review the grid manually or try again.");
  }
  const values = [];
  const kinds = [];
  for (const cell of rows.flat()) {
    if (cell?.kind === "value" && Number.isInteger(cell.value) && cell.value >= 1 && cell.value <= 9) {
      values.push(String(cell.value));
      kinds.push("value");
      continue;
    }
    if (cell?.kind === "notes" && Array.isArray(cell.notes) && cell.notes.every((digit) => Number.isInteger(digit) && digit >= 1 && digit <= 9)) {
      values.push([...new Set(cell.notes)].sort((a, b) => a - b).join(""));
      kinds.push("notes");
      continue;
    }
    throw new Error("Online recognition returned an invalid puzzle cell. Review the grid manually or try again.");
  }
  return { values, kinds };
}

function cancelOcr() {
  const abortController = state.ocrAbortController;
  state.ocrRequestId = null;
  state.ocrLoading = false;
  state.ocrAbortController = null;
  state.importError = "";
  state.importStatus = "Online scan cancelled. Sudoku Pilot stopped waiting; a scan already sent may still count against the shared quota.";
  abortController?.abort();
  render();
}

function moveSelection(dx, dy) {
  const current = state.selected ?? 0;
  const row = Math.max(0, Math.min(8, rowOf(current) + dy));
  const col = Math.max(0, Math.min(8, colOf(current) + dx));
  state.selected = row * 9 + col;
  render();
}

function createFreshPuzzle(difficulty) {
  const generated = generatePuzzle({ difficulty, playedCanonicalIds });
  playedCanonicalIds.add(generated.canonicalId);
  savePlayedCanonicalIds();
  return createPuzzle(generated.grid, generated.solution);
}

function loadPlayedCanonicalIds() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(PLAYED_PUZZLES_KEY) || "[]");
    return new Set(Array.isArray(saved) ? saved.filter((id) => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

function savePlayedCanonicalIds() {
  try {
    window.localStorage.setItem(PLAYED_PUZZLES_KEY, JSON.stringify([...playedCanonicalIds]));
  } catch {
    // Puzzle play remains available when storage is blocked; only unseen preference is lost.
  }
}

function getUnitsForCheck() {
  const units = [];
  for (let row = 0; row < 9; row += 1) {
    units.push({ label: `Row ${row + 1}`, cells: Array.from({ length: 9 }, (_, col) => row * 9 + col) });
  }
  for (let col = 0; col < 9; col += 1) {
    units.push({ label: `Column ${col + 1}`, cells: Array.from({ length: 9 }, (_, row) => row * 9 + col) });
  }
  for (let box = 0; box < 9; box += 1) {
    const top = Math.floor(box / 3) * 3;
    const left = (box % 3) * 3;
    const cells = [];
    for (let row = top; row < top + 3; row += 1) {
      for (let col = left; col < left + 3; col += 1) cells.push(row * 9 + col);
    }
    units.push({ label: `Block ${box + 1}`, cells });
  }
  return units;
}

function getLineCounts(digit) {
  return {
    rows: Array.from({ length: 9 }, (_, row) => countDigitInCells(digit, Array.from({ length: 9 }, (__, col) => row * 9 + col))),
    columns: Array.from({ length: 9 }, (_, col) => countDigitInCells(digit, Array.from({ length: 9 }, (__, row) => row * 9 + col)))
  };
}

function countDigitInCells(digit, cells) {
  return cells.filter((index) => state.puzzle.values[index] === digit || (!state.puzzle.values[index] && state.puzzle.notes[index].has(digit))).length;
}

function highlightedDigitForSelection() {
  if (state.selected === null) return null;
  const selectedValue = state.puzzle.values[state.selected];
  const selectedNotes = state.puzzle.notes[state.selected] || new Set();
  return selectedValue || (selectedNotes.size === 1 ? [...selectedNotes][0] : null);
}

function isTextEditingTarget(target) {
  if (!target || typeof target !== "object") return false;
  const tagName = target.tagName?.toLowerCase();
  return ["input", "textarea", "select"].includes(tagName) || target.isContentEditable === true;
}

function cellDescription(index, value, notes, given, selected, issue) {
  const stateText = value ? `value ${value}` : notes.length ? `notes ${notes.join(", ")}` : "empty";
  return `${cellName(index)}, ${stateText}${given ? ", given" : ""}${selected ? ", selected" : ""}${issue ? ", conflicts with Sudoku rules" : ""}`;
}

function feedbackHref() {
  const subject = encodeURIComponent(`Sudoku Pilot feedback: ${titleCase(state.difficulty)} puzzle`);
  const body = encodeURIComponent([
    "What happened?",
    "",
    "What did you expect?",
    "",
    `Difficulty: ${state.difficulty}`,
    `Selected techniques: ${[...state.allowedTechniques].join(", ")}`
  ].join("\n"));
  const recipient = FEEDBACK_EMAIL ? encodeURIComponent(FEEDBACK_EMAIL) : "";
  return `mailto:${recipient}?subject=${subject}&body=${body}`;
}

function sameBox(a, b) {
  return Math.floor(rowOf(a) / 3) === Math.floor(rowOf(b) / 3) && Math.floor(colOf(a) / 3) === Math.floor(colOf(b) / 3);
}

function groupMoves(moves) {
  const counts = new Map();
  for (const move of moves) counts.set(move.technique, (counts.get(move.technique) || 0) + 1);
  return [...counts.entries()];
}

function titleCase(value) {
  return value[0].toUpperCase() + value.slice(1);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}
