import { randomUUID } from "node:crypto";
import { SudokuOcrProviderError, scanSudokuImage } from "../server/sudoku-ocr-client.js";

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const ONE_HOUR_MS = 60 * 60 * 1000;
const recentCallsByClient = new Map();

function hasExpectedImageSignature(bytes, contentType) {
  if (contentType === "image/png") {
    return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (contentType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (contentType === "image/webp") {
    return bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  }
  return false;
}

function sendJson(response, status, body) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.status(status).end(JSON.stringify(body));
}

function isSameOriginBrowserRequest(request) {
  const fetchSite = String(request.headers["sec-fetch-site"] || "").toLowerCase();
  if (fetchSite && !["same-origin", "none"].includes(fetchSite)) return false;
  const origin = request.headers.origin;
  const host = request.headers.host;
  if (!origin || !host) return true;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function takeClientQuota(request, now = Date.now()) {
  const configuredLimit = Number(process.env.SUDOKU_OCR_MAX_CALLS_PER_IP_PER_HOUR || 3);
  const limit = Number.isInteger(configuredLimit) && configuredLimit > 0 ? Math.min(configuredLimit, 20) : 3;
  const forwardedFor = String(request.headers["x-forwarded-for"] || "unknown").split(",", 1)[0].trim();
  const recent = (recentCallsByClient.get(forwardedFor) || []).filter((timestamp) => now - timestamp < ONE_HOUR_MS);
  if (recent.length >= limit) {
    recentCallsByClient.set(forwardedFor, recent);
    return false;
  }
  recent.push(now);
  recentCallsByClient.set(forwardedFor, recent);
  if (recentCallsByClient.size > 5_000) recentCallsByClient.clear();
  return true;
}

async function readBody(request) {
  if (Buffer.isBuffer(request.body)) return request.body;
  if (request.body instanceof Uint8Array) return Buffer.from(request.body);

  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.byteLength;
    if (total > MAX_IMAGE_BYTES) throw new Error("IMAGE_TOO_LARGE");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

export default async function handler(request, response) {
  const requestId = String(request.headers["x-vercel-id"] || randomUUID());
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return sendJson(response, 405, { error: "Method not allowed" });
  }

  if (!isSameOriginBrowserRequest(request)) {
    return sendJson(response, 403, { error: "Online OCR requests must come from Sudoku Pilot" });
  }

  const contentType = String(request.headers["content-type"] || "").split(";", 1)[0].trim().toLowerCase();
  if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
    return sendJson(response, 415, { error: "Upload a PNG, JPEG, or WebP image" });
  }

  const declaredLength = Number(request.headers["content-length"] || 0);
  if (declaredLength > MAX_IMAGE_BYTES) {
    return sendJson(response, 413, { error: "Image must be 4 MB or smaller" });
  }

  if (process.env.SUDOKU_OCR_ENABLED !== "true" || !process.env.RAPIDAPI_KEY) {
    console.error(JSON.stringify({
      level: "error",
      service: "sudoku-ocr",
      event: "sudoku_ocr_configuration_error",
      message: "Online OCR is disabled or RAPIDAPI_KEY is not configured"
    }));
    return sendJson(response, 503, { error: "Online OCR is not configured" });
  }

  try {
    const body = await readBody(request);
    if (body.byteLength === 0) return sendJson(response, 400, { error: "Image body is empty" });
    if (body.byteLength > MAX_IMAGE_BYTES) return sendJson(response, 413, { error: "Image must be 4 MB or smaller" });
    if (!hasExpectedImageSignature(body, contentType)) {
      return sendJson(response, 400, { error: "Image contents do not match the selected file type" });
    }
    if (!takeClientQuota(request)) {
      return sendJson(response, 429, { error: "This connection has reached the temporary online OCR usage limit. Review the grid manually or try again later." });
    }

    const result = await scanSudokuImage({
      bytes: body,
      contentType,
      filename: "sudoku-image",
      apiKey: process.env.RAPIDAPI_KEY,
      requestId,
      signal: request.signal
    });
    return sendJson(response, 200, { puzzle: result.puzzle });
  } catch (error) {
    if (error?.message === "IMAGE_TOO_LARGE") {
      return sendJson(response, 413, { error: "Image must be 4 MB or smaller" });
    }
    console.error(JSON.stringify({
      level: "error",
      service: "sudoku-ocr",
      event: "sudoku_ocr_request_failed",
      request_id: requestId,
      error_name: error instanceof Error ? error.name : "UnknownError",
      error_code: error instanceof SudokuOcrProviderError ? error.code : "APPLICATION_ERROR",
      provider_status: error instanceof SudokuOcrProviderError ? error.providerStatus : null
    }));
    if (error instanceof SudokuOcrProviderError) {
      if (error.code === "CANCELLED") {
        if (request.signal?.aborted) return;
        return sendJson(response, 499, { error: "Online OCR request was cancelled" });
      }
      if (error.code === "TIMEOUT") {
        return sendJson(response, 504, { error: "Online OCR took too long. Review the grid manually or try again later." });
      }
      if (error.providerStatus === 429) {
        return sendJson(response, 429, { error: "Online OCR has reached its current usage limit. Review the grid manually or try again later." });
      }
      if ([400, 413, 415, 422].includes(error.providerStatus)) {
        return sendJson(response, 422, { error: "Online OCR could not recognize this image. Try a closer, clearer grid or review it manually." });
      }
      if ([401, 403].includes(error.providerStatus)) {
        return sendJson(response, 503, { error: "Online OCR is temporarily unavailable. Review the grid manually or try again later." });
      }
    }
    return sendJson(response, 502, { error: "Online OCR could not process this image" });
  }
}
