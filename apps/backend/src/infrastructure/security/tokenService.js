import crypto from "node:crypto";
import { config } from "../../config/index.js";
import { AppError } from "../../domain/errors/AppError.js";

function base64UrlEncode(input) {
  return Buffer.from(input).toString("base64url");
}

function base64UrlDecode(input) {
  return Buffer.from(input, "base64url").toString("utf8");
}

function signPayload(payload, secret) {
  const data = base64UrlEncode(JSON.stringify(payload));
  const signature = crypto.createHmac("sha256", secret).update(data).digest("base64url");
  return `${data}.${signature}`;
}

function verifyPayload(token, secret) {
  const [data, signature] = token.split(".");
  if (!data || !signature) {
    throw new AppError("invalid token format", 401, "INVALID_TOKEN");
  }

  const expected = crypto.createHmac("sha256", secret).update(data).digest("base64url");
  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (sigBuffer.length !== expectedBuffer.length) {
    throw new AppError("invalid token signature", 401, "INVALID_TOKEN");
  }
  const valid = crypto.timingSafeEqual(sigBuffer, expectedBuffer);
  if (!valid) {
    throw new AppError("invalid token signature", 401, "INVALID_TOKEN");
  }

  const payload = JSON.parse(base64UrlDecode(data));
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
    throw new AppError("token expired", 401, "TOKEN_EXPIRED");
  }

  return payload;
}

export function issueAccessToken({ userId, sessionId, role, permissions }) {
  const now = Math.floor(Date.now() / 1000);
  return signPayload(
    {
      sub: userId,
      sid: sessionId,
      role,
      permissions,
      type: "access",
      iat: now,
      exp: now + config.accessTokenTtlSeconds
    },
    config.authTokenSecret
  );
}

export function issueRefreshToken({ userId, sessionId }) {
  const now = Math.floor(Date.now() / 1000);
  return signPayload(
    {
      sub: userId,
      sid: sessionId,
      type: "refresh",
      nonce: crypto.randomBytes(12).toString("hex"),
      iat: now,
      exp: now + config.refreshTokenTtlSeconds
    },
    config.refreshTokenSecret
  );
}

export function verifyAccessToken(token) {
  const payload = verifyPayload(token, config.authTokenSecret);
  if (payload.type !== "access") {
    throw new AppError("token type mismatch", 401, "INVALID_TOKEN");
  }
  return payload;
}

export function verifyRefreshToken(token) {
  const payload = verifyPayload(token, config.refreshTokenSecret);
  if (payload.type !== "refresh") {
    throw new AppError("token type mismatch", 401, "INVALID_TOKEN");
  }
  return payload;
}

export function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}
