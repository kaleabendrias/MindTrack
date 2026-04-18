import crypto from "node:crypto";

export const BASE = process.env.BACKEND_BASE_URL || "http://127.0.0.1:4000";
export const ADMIN_PASS = process.env.SEED_ADMIN_PASSWORD || "RotateMe_Admin_2026x1";
export const CLINICIAN_PASS = process.env.SEED_CLINICIAN_PASSWORD || "RotateMe_Clinician_2026x1";
export const CLIENT_PASS = process.env.SEED_CLIENT_PASSWORD || "RotateMe_Client_2026x1";

export function cookiesFrom(response) {
  return (response.headers.getSetCookie?.() || [])
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

export function trustedHeaders(session, path, { method = "GET", body = "", idempotencyKey } = {}) {
  const timestamp = Date.now();
  const nonce = crypto.randomUUID();
  const payload = [method.toUpperCase(), path, String(timestamp), nonce, body].join("|");
  const signingKey = session.csrfToken;
  const signature = crypto.createHmac("sha256", signingKey).update(payload).digest("hex");

  const headers = {
    cookie: session.cookie,
    "content-type": "application/json",
    "x-signature-timestamp": String(timestamp),
    "x-signature-nonce": nonce,
    "x-signature": signature
  };

  if (!["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase())) {
    headers["x-csrf-token"] = session.csrfToken;
    headers["x-request-nonce"] = nonce;
  }

  if (idempotencyKey) {
    headers["x-idempotency-key"] = idempotencyKey;
  }

  return headers;
}

export async function login(username, password) {
  const response = await fetch(`${BASE}/api/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  const json = await response.json();
  return {
    status: response.status,
    json,
    cookie: cookiesFrom(response),
    csrfToken: json.data?.csrfToken
  };
}
