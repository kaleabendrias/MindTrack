import { logger } from "../shared/utils/diagnosticLogger.js";

const API_BASE = "/api/v1";

let sessionState = null;

export function getSessionState() {
  return sessionState;
}

export function setSessionState(nextState) {
  sessionState = nextState;
}

export function clearSessionState() {
  sessionState = null;
}

async function refreshSession() {
  const response = await fetch(`${API_BASE}/auth/refresh`, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({})
  });

  if (!response.ok) {
    clearSessionState();
    throw new Error("session expired");
  }

  const json = await response.json();
  sessionState = {
    ...(sessionState || {}),
    csrfToken: json.data.csrfToken
  };

  return sessionState;
}

export async function apiRequest(path, options = {}, attempt = 0) {
  const method = (options.method || "GET").toUpperCase();
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };

  const nonce = options.nonce || crypto.randomUUID();
  const bodyString = options.body ? String(options.body) : "";

  if (sessionState?.csrfToken) {
    const timestamp = Date.now();
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(sessionState.csrfToken),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const payload = [method, `${API_BASE}${path}`, String(timestamp), nonce, bodyString].join("|");
    const signed = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
    const signature = Array.from(new Uint8Array(signed))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");

    headers["x-signature-timestamp"] = String(timestamp);
    headers["x-signature-nonce"] = nonce;
    headers["x-signature"] = signature;
  }

  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    if (sessionState?.csrfToken) {
      headers["x-csrf-token"] = sessionState.csrfToken;
    }
    headers["x-request-nonce"] = nonce;
  }

  if (options.idempotencyKey) {
    headers["x-idempotency-key"] = options.idempotencyKey;
  }

  logger.debug("api", `${method} ${path}`, { attempt });

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "same-origin",
    headers,
    body: options.body
  });

  if (response.status === 401 && attempt === 0 && path !== "/auth/refresh" && path !== "/auth/login") {
    logger.info("auth", "session expired, refreshing", { path });
    await refreshSession();
    return apiRequest(path, options, 1);
  }

  const json = await response.json();
  if (!response.ok) {
    logger.warn("api", `request failed: ${method} ${path}`, { status: response.status, code: json.code });
    const error = new Error(json.error || "request failed");
    error.code = json.code;
    error.details = json.details;
    throw error;
  }

  return json;
}
