import assert from "node:assert/strict";
import { normalizeSudokuOcrResponse, scanSudokuImage } from "../server/sudoku-ocr-client.js";

const providerRows = Array.from({ length: 9 }, (_, row) => ({
  cells: Array.from({ length: 9 }, (_, column) => {
    if (row === 0 && column === 0) return { cell_type: "solved", value: 5 };
    if (row === 0 && column === 1) return { cell_type: "unsolved", candidates: [7, 2, 2] };
    return { cell_type: "unsolved", candidates: [] };
  })
}));

const normalized = normalizeSudokuOcrResponse({ puzzle: { rows: providerRows } });
assert.deepEqual(normalized.cells[0][0], { kind: "value", value: 5 });
assert.deepEqual(normalized.cells[0][1], { kind: "notes", notes: [2, 7] });
assert.deepEqual(normalized.cells[8][8], { kind: "notes", notes: [] });

const logLines = [];
let fetchCalls = 0;
const result = await scanSudokuImage({
  bytes: new Uint8Array([1, 2, 3]),
  contentType: "image/png",
  filename: "fixture.png",
  apiKey: "test-key-never-logged",
  requestId: "test-request",
  logger: {
    info(line) { logLines.push(JSON.parse(line)); },
    error(line) { logLines.push(JSON.parse(line)); }
  },
  fetchImpl: async (url, options) => {
    fetchCalls += 1;
    assert.equal(url, "https://sudoku-ocr.p.rapidapi.com/scan-puzzle");
    assert.equal(options.method, "POST");
    assert.equal(options.headers["x-rapidapi-key"], "test-key-never-logged");
    assert.equal(options.headers["x-rapidapi-host"], "sudoku-ocr.p.rapidapi.com");
    assert.ok(options.body instanceof FormData);
    return new Response(JSON.stringify({ puzzle: { rows: providerRows } }), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "x-ratelimit-requests-limit": "30",
        "x-ratelimit-requests-remaining": "29"
      }
    });
  }
});

assert.equal(fetchCalls, 1, "the provider client must never retry implicitly");
assert.deepEqual(result.puzzle.cells[0][1], { kind: "notes", notes: [2, 7] });
assert.equal(result.quota.requests_remaining, "29");
const usageLogs = logLines.filter((line) => line.event === "sudoku_ocr_provider_call");
assert.equal(usageLogs.length, 1);
assert.equal(usageLogs[0].provider_calls, 1);
assert.equal(usageLogs[0].retry, false);
assert.equal(JSON.stringify(logLines).includes("test-key-never-logged"), false, "logs must never contain the API key");

console.log("Sudoku OCR API contract tests passed without a live provider call");
