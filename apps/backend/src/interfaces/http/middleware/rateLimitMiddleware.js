import { config } from "../../../config/index.js";
import { AppError } from "../../../domain/errors/AppError.js";

const sessionBuckets = new Map();
const ipBuckets = new Map();

export function sessionRateLimiter(req, _res, next) {
  if (!req.user?.sessionId) {
    next();
    return;
  }

  const now = Date.now();
  const sessionId = req.user.sessionId;
  const bucket = sessionBuckets.get(sessionId) || {
    windowStart: now,
    count: 0
  };

  if (now - bucket.windowStart >= 60_000) {
    bucket.windowStart = now;
    bucket.count = 0;
  }

  bucket.count += 1;
  sessionBuckets.set(sessionId, bucket);

  if (bucket.count > config.sessionRateLimitPerMinute) {
    next(new AppError("rate limit exceeded for session", 429, "RATE_LIMIT_EXCEEDED"));
    return;
  }

  next();
}

export function recoveryRateLimiter(req, _res, next) {
  const ip = req.ip || "unknown";
  const now = Date.now();
  const bucket = ipBuckets.get(ip) || { windowStart: now, count: 0, lockedUntil: 0 };

  if (now < bucket.lockedUntil) {
    next(new AppError("too many recovery attempts, try again later", 429, "RECOVERY_RATE_LIMIT"));
    return;
  }

  if (now - bucket.windowStart >= 15 * 60_000) {
    bucket.windowStart = now;
    bucket.count = 0;
    bucket.lockedUntil = 0;
  }

  bucket.count += 1;
  ipBuckets.set(ip, bucket);

  if (bucket.count > 5) {
    bucket.lockedUntil = now + 15 * 60_000;
    ipBuckets.set(ip, bucket);
    next(new AppError("too many recovery attempts, try again later", 429, "RECOVERY_RATE_LIMIT"));
    return;
  }

  next();
}
