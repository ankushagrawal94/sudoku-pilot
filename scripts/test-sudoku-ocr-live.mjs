import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { scanSudokuImage } from "../server/sudoku-ocr-client.js";

if (!process.argv.includes("--confirm-live-call")) {
  console.error("Live test not run. Pass --confirm-live-call to spend exactly one RapidAPI request.");
  process.exit(2);
}

const imagePath = process.argv.find((argument) => argument.startsWith("--image="))?.slice("--image=".length)
  || "resources/sudoku-ocr-api/notes-fixture.png";
const isCheckedFixture = imagePath === "resources/sudoku-ocr-api/notes-fixture.png";
const bytes = await readFile(imagePath);
const contentType = imagePath.endsWith(".webp") ? "image/webp" : imagePath.match(/\.jpe?g$/i) ? "image/jpeg" : "image/png";

// scanSudokuImage contains no retry path. This script invokes it exactly once.
const result = await scanSudokuImage({
  bytes,
  contentType,
  filename: basename(imagePath),
  apiKey: process.env.RAPIDAPI_KEY,
  requestId: `one-off-live-${Date.now()}`
});

const values = result.puzzle.cells.flat().filter((cell) => cell.kind === "value").length;
const noteCells = result.puzzle.cells.flat().filter((cell) => cell.kind === "notes" && cell.notes.length > 0).length;
const expected = isCheckedFixture
  ? JSON.parse(await readFile("resources/sudoku-ocr-api/notes-fixture.expected.json", "utf8"))
  : { value_cells: {}, note_cells: {} };
const cellAt = (name) => {
  const match = /^r([1-9])c([1-9])$/.exec(name);
  return result.puzzle.cells[Number(match[1]) - 1][Number(match[2]) - 1];
};
const valueChecks = Object.entries(expected.value_cells).map(([name, value]) => ({
  name,
  exact: cellAt(name).kind === "value" && cellAt(name).value === value
}));
const noteChecks = Object.entries(expected.note_cells).map(([name, notes]) => ({
  name,
  expected: notes,
  actual: cellAt(name).kind === "notes" ? cellAt(name).notes : null,
  exact: cellAt(name).kind === "notes" && JSON.stringify(cellAt(name).notes) === JSON.stringify(notes)
}));
const evaluationPassed = !isCheckedFixture || (valueChecks.every((check) => check.exact) && noteChecks.every((check) => check.exact));
console.log(JSON.stringify({
  live_test: evaluationPassed ? "passed" : "completed_with_mismatches",
  provider_calls: 1,
  image: imagePath,
  recognized_values: values,
  recognized_note_cells: noteCells,
  expected_values_exact: valueChecks.filter((check) => check.exact).length,
  expected_values_total: valueChecks.length,
  expected_note_cells_exact: noteChecks.filter((check) => check.exact).length,
  expected_note_cells_total: noteChecks.length,
  note_mismatches: noteChecks.filter((check) => !check.exact),
  quota: result.quota
}, null, 2));
if (!evaluationPassed) process.exitCode = 1;
