import crypto from "node:crypto";
import { AppError } from "../../domain/errors/AppError.js";

export function createSigningPayload({ method, path, timestamp, nonce, body }) {
  return [method.toUpperCase(), path, String(timestamp), nonce, body || ""].join("|");
}

export function verifyRequestSignature({ method, path, timestamp, nonce, body, signature, secret }) {
  const now = Date.now();
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) {
    throw new AppError("invalid signature timestamp", 401, "INVALID_SIGNATURE");
  }

  const skew = Math.abs(now - ts);
  if (skew > 5 * 60 * 1000) {
    throw new AppError("stale request signature", 401, "STALE_SIGNATURE");
  }

  const payload = createSigningPayload({ method, path, timestamp: ts, nonce, body });
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");

  if (!signature || signature.length !== expected.length) {
    throw new AppError("invalid request signature", 401, "INVALID_SIGNATURE");
  }

  const isValid = crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  if (!isValid) {
    throw new AppError("invalid request signature", 401, "INVALID_SIGNATURE");
  }
}
