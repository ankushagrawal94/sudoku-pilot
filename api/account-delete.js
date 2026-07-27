import { randomUUID } from "node:crypto";
import { AccountDeletionError, deleteAccount } from "../server/account-deletion.js";

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

function bearerToken(request) {
  const authorization = String(request.headers.authorization || "");
  return authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
}

function confirmationValue(request) {
  if (request.body && typeof request.body === "object" && !Buffer.isBuffer(request.body)) {
    return request.body.confirmation;
  }
  if (typeof request.body === "string" || Buffer.isBuffer(request.body)) {
    try {
      return JSON.parse(String(request.body)).confirmation;
    } catch {
      return "";
    }
  }
  return "";
}

export default async function handler(request, response) {
  const requestId = String(request.headers["x-vercel-id"] || randomUUID());
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return sendJson(response, 405, { error: "Method not allowed" });
  }
  if (!isSameOriginBrowserRequest(request)) {
    return sendJson(response, 403, { error: "Account deletion requests must come from Sudoku Pilot" });
  }
  if (confirmationValue(request) !== "DELETE") {
    return sendJson(response, 400, { error: "Type DELETE to confirm account deletion" });
  }

  try {
    const result = await deleteAccount({ token: bearerToken(request) });
    return sendJson(response, 200, result);
  } catch (error) {
    const status = error instanceof AccountDeletionError ? error.status : 500;
    console.error(JSON.stringify({
      level: "error",
      service: "account-delete",
      event: "account_delete_failed",
      request_id: requestId,
      error_code: error instanceof AccountDeletionError ? error.code : "APPLICATION_ERROR"
    }));
    if (status === 401) {
      return sendJson(response, 401, { error: "Sign in again before deleting your account" });
    }
    if (status === 503) {
      return sendJson(response, 503, { error: "Account deletion is not configured" });
    }
    return sendJson(response, 502, { error: "Account deletion could not be completed" });
  }
}
