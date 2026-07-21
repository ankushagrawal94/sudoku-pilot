import assert from "node:assert/strict";
import { Readable } from "node:stream";
import sudokuOcrHandler from "../api/sudoku-ocr.js";
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

const failedLogLines = [];
await assert.rejects(
  scanSudokuImage({
    bytes: new Uint8Array([1, 2, 3]),
    contentType: "image/png",
    filename: "fixture.png",
    apiKey: "test-key-never-logged",
    requestId: "failed-test-request",
    logger: {
      info(line) { failedLogLines.push(JSON.parse(line)); },
      error(line) { failedLogLines.push(JSON.parse(line)); }
    },
    fetchImpl: async () => new Response("provider body with puzzle data", { status: 422 })
  }),
  (error) => error.message === "Sudoku OCR returned HTTP 422"
);
assert.equal(JSON.stringify(failedLogLines).includes("provider body with puzzle data"), false, "logs must never contain provider response bodies");
assert.equal(failedLogLines.filter((line) => line.event === "sudoku_ocr_provider_call").length, 1);

const cancelledController = new AbortController();
cancelledController.abort();
await assert.rejects(
  scanSudokuImage({
    bytes: new Uint8Array([1, 2, 3]),
    contentType: "image/png",
    apiKey: "test-key-never-logged",
    requestId: "cancelled-test-request",
    signal: cancelledController.signal,
    logger: { info() {}, error() {} },
    fetchImpl: async (_url, options) => {
      assert.equal(options.signal.aborted, true);
      const error = new Error("aborted");
      error.name = "AbortError";
      throw error;
    }
  }),
  (error) => error.code === "CANCELLED"
);

const originalApiKey = process.env.RAPIDAPI_KEY;
const originalOcrEnabled = process.env.SUDOKU_OCR_ENABLED;
process.env.RAPIDAPI_KEY = "route-test-key";
process.env.SUDOKU_OCR_ENABLED = "true";
const invalidImageRequest = Readable.from([Buffer.from("not a png")]);
invalidImageRequest.method = "POST";
invalidImageRequest.headers = {
  "content-type": "image/png",
  "content-length": "9"
};
const routeResult = await invokeRoute(invalidImageRequest);
assert.equal(routeResult.status, 400);
assert.deepEqual(routeResult.body, { error: "Image contents do not match the selected file type" });

const originalFetch = globalThis.fetch;
globalThis.fetch = async () => new Response("quota exhausted", {
  status: 429,
  headers: {
    "x-ratelimit-requests-limit": "30",
    "x-ratelimit-requests-remaining": "0"
  }
});
const validPngRequest = Readable.from([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])]);
validPngRequest.method = "POST";
validPngRequest.headers = {
  "content-type": "image/png",
  "content-length": "8",
  "x-vercel-id": "quota-route-test"
};
const quotaResult = await invokeRoute(validPngRequest);
assert.equal(quotaResult.status, 429);
assert.match(quotaResult.body.error, /usage limit/);
globalThis.fetch = originalFetch;
if (originalApiKey === undefined) delete process.env.RAPIDAPI_KEY;
else process.env.RAPIDAPI_KEY = originalApiKey;
if (originalOcrEnabled === undefined) delete process.env.SUDOKU_OCR_ENABLED;
else process.env.SUDOKU_OCR_ENABLED = originalOcrEnabled;

console.log("Sudoku OCR API contract tests passed without a live provider call");

function invokeRoute(request) {
  return new Promise((resolve) => {
    const headers = {};
    const response = {
      setHeader(name, value) { headers[name.toLowerCase()] = value; },
      status(code) { this.statusCode = code; return this; },
      end(body) {
        resolve({ status: this.statusCode, headers, body: JSON.parse(body) });
      }
    };
    sudokuOcrHandler(request, response);
  });
}
