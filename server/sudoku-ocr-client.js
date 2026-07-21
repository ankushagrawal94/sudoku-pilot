const PROVIDER_HOST = "sudoku-ocr.p.rapidapi.com";
const PROVIDER_URL = `https://${PROVIDER_HOST}/scan-puzzle`;
const PROVIDER_TIMEOUT_MS = 25_000;

export class SudokuOcrProviderError extends Error {
  constructor(message, { providerStatus = null, quota = null, code = "PROVIDER_ERROR" } = {}) {
    super(message);
    this.name = "SudokuOcrProviderError";
    this.providerStatus = providerStatus;
    this.quota = quota;
    this.code = code;
  }
}

function logEvent(logger, level, fields) {
  const method = level === "error" ? "error" : "info";
  logger[method](JSON.stringify({
    level,
    service: "sudoku-ocr",
    timestamp: new Date().toISOString(),
    ...fields
  }));
}

function quotaFromHeaders(headers) {
  const value = (name) => headers.get(name) || null;
  return {
    requests_limit: value("x-ratelimit-requests-limit"),
    requests_remaining: value("x-ratelimit-requests-remaining"),
    requests_reset_seconds: value("x-ratelimit-requests-reset"),
    free_plan_limit: value("x-rate-limit-rapid-free-plans-hard-limit-limit"),
    free_plan_remaining: value("x-rate-limit-rapid-free-plans-hard-limit-remaining"),
    free_plan_reset_seconds: value("x-rate-limit-rapid-free-plans-hard-limit-reset")
  };
}

function requireDigit(value, context) {
  if (!Number.isInteger(value) || value < 1 || value > 9) {
    throw new Error(`Invalid digit at ${context}`);
  }
  return value;
}

export function normalizeSudokuOcrResponse(payload) {
  const rows = payload?.puzzle?.rows;
  if (!Array.isArray(rows) || rows.length !== 9) {
    throw new Error("Provider response does not contain nine rows");
  }

  const cells = rows.map((row, rowIndex) => {
    if (!Array.isArray(row?.cells) || row.cells.length !== 9) {
      throw new Error(`Provider response row ${rowIndex + 1} does not contain nine cells`);
    }

    return row.cells.map((cell, columnIndex) => {
      const context = `r${rowIndex + 1}c${columnIndex + 1}`;
      if (cell?.cell_type === "solved") {
        return { kind: "value", value: requireDigit(cell.value, context) };
      }
      if (cell?.cell_type === "unsolved") {
        if (!Array.isArray(cell.candidates)) {
          throw new Error(`Provider response candidates are missing at ${context}`);
        }
        const notes = [...new Set(cell.candidates.map((digit) => requireDigit(digit, context)))].sort((a, b) => a - b);
        return { kind: "notes", notes };
      }
      throw new Error(`Provider response has an unknown cell type at ${context}`);
    });
  });

  return { cells };
}

export async function scanSudokuImage({
  bytes,
  contentType,
  filename = "sudoku.png",
  apiKey,
  requestId,
  fetchImpl = fetch,
  logger = console,
  timeoutMs = PROVIDER_TIMEOUT_MS,
  signal
}) {
  if (!apiKey) throw new Error("RAPIDAPI_KEY is not configured");
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) throw new Error("Image bytes are required");

  const formData = new FormData();
  formData.append("file", new Blob([bytes], { type: contentType }), filename);
  const timeoutController = new AbortController();
  const requestSignal = signal
    ? AbortSignal.any([signal, timeoutController.signal])
    : timeoutController.signal;
  const timeout = setTimeout(() => timeoutController.abort(), timeoutMs);
  const startedAt = Date.now();

  // This is the canonical usage event. Count this event to count provider calls.
  logEvent(logger, "info", {
    event: "sudoku_ocr_provider_call",
    provider: "rapidapi",
    operation: "scan-puzzle",
    provider_calls: 1,
    retry: false,
    request_id: requestId,
    image_bytes: bytes.byteLength,
    image_type: contentType,
    billing_month_utc: new Date().toISOString().slice(0, 7)
  });

  try {
    const response = await fetchImpl(PROVIDER_URL, {
      method: "POST",
      headers: {
        "x-rapidapi-key": apiKey,
        "x-rapidapi-host": PROVIDER_HOST
      },
      body: formData,
      signal: requestSignal
    });
    const quota = quotaFromHeaders(response.headers);

    logEvent(logger, response.ok ? "info" : "error", {
      event: "sudoku_ocr_provider_response",
      provider: "rapidapi",
      operation: "scan-puzzle",
      request_id: requestId,
      status: response.status,
      duration_ms: Date.now() - startedAt,
      ...quota
    });

    if (!response.ok) {
      // Consume the body so the connection can be reused, but never retain or
      // surface provider response content in errors or application logs.
      await response.text();
      throw new SudokuOcrProviderError(
        `Sudoku OCR returned HTTP ${response.status}`,
        { providerStatus: response.status, quota }
      );
    }

    const payload = await response.json();
    return { puzzle: normalizeSudokuOcrResponse(payload), quota };
  } catch (error) {
    if (error?.name === "AbortError") {
      if (signal?.aborted) {
        throw new SudokuOcrProviderError("Sudoku OCR request was cancelled", { code: "CANCELLED" });
      }
      throw new SudokuOcrProviderError(`Sudoku OCR timed out after ${timeoutMs} ms`, { code: "TIMEOUT" });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
