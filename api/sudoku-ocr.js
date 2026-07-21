import { randomUUID } from "node:crypto";
import { scanSudokuImage } from "../server/sudoku-ocr-client.js";

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

function sendJson(response, status, body) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.status(status).end(JSON.stringify(body));
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
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return sendJson(response, 405, { error: "Method not allowed" });
  }

  const contentType = String(request.headers["content-type"] || "").split(";", 1)[0].trim().toLowerCase();
  if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
    return sendJson(response, 415, { error: "Upload a PNG, JPEG, or WebP image" });
  }

  const declaredLength = Number(request.headers["content-length"] || 0);
  if (declaredLength > MAX_IMAGE_BYTES) {
    return sendJson(response, 413, { error: "Image must be 4 MB or smaller" });
  }

  if (!process.env.RAPIDAPI_KEY) {
    console.error(JSON.stringify({
      level: "error",
      service: "sudoku-ocr",
      event: "sudoku_ocr_configuration_error",
      message: "RAPIDAPI_KEY is not configured"
    }));
    return sendJson(response, 503, { error: "Online OCR is not configured" });
  }

  try {
    const body = await readBody(request);
    if (body.byteLength === 0) return sendJson(response, 400, { error: "Image body is empty" });
    if (body.byteLength > MAX_IMAGE_BYTES) return sendJson(response, 413, { error: "Image must be 4 MB or smaller" });

    const requestId = String(request.headers["x-vercel-id"] || randomUUID());
    const filename = String(request.headers["x-sudoku-image-name"] || "sudoku").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100);
    const result = await scanSudokuImage({
      bytes: body,
      contentType,
      filename,
      apiKey: process.env.RAPIDAPI_KEY,
      requestId
    });
    return sendJson(response, 200, result);
  } catch (error) {
    if (error?.message === "IMAGE_TOO_LARGE") {
      return sendJson(response, 413, { error: "Image must be 4 MB or smaller" });
    }
    console.error(JSON.stringify({
      level: "error",
      service: "sudoku-ocr",
      event: "sudoku_ocr_request_failed",
      error: error instanceof Error ? error.message : String(error)
    }));
    return sendJson(response, 502, { error: "Online OCR could not process this image" });
  }
}
