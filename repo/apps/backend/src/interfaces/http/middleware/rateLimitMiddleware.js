import { config } from "../../../config/index.js";
import { AppError } from "../../../domain/errors/AppError.js";
import { MongoRateLimitRepository } from "../../../infrastructure/repositories/MongoRateLimitRepository.js";

// Persistent rate-limit storage. The previous implementation used in-memory
// Maps, which silently reset on every backend restart and could not be shared
// across multiple backend instances. This module now backs every limiter
// against MongoDB so abuse-control budgets survive restarts and are
// distributed-ready.
const repository = new MongoRateLimitRepository();

const SESSION_WINDOW_MS = 60_000;
const RECOVERY_WINDOW_MS = 15 * 60_000;
const RECOVERY_LIMIT = 5;
const RECOVERY_LOCK_MS = 15 * 60_000;
// /auth/security-questions is a non-mutating lookup that legitimately may
// be called several times by the same user trying to remember their
// account. It still must be rate limited to prevent enumeration probing,
// but the budget is more generous than the strict /recover-password limit.
const QUESTION_LOOKUP_LIMIT = 30;

export function createSessionRateLimiter(deps = {}) {
  const repo = deps.repository || repository;
  return async function sessionRateLimiter(req, _res, next) {
    try {
      if (!req.user?.sessionId) {
        next();
        return;
      }
      const key = `session:${req.user.sessionId}`;
      const state = await repo.incrementAndCheck(key, "session", SESSION_WINDOW_MS);
      if (state.count > config.sessionRateLimitPerMinute) {
        next(new AppError("rate limit exceeded for session", 429, "RATE_LIMIT_EXCEEDED"));
        return;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function createRecoveryRateLimiter(deps = {}) {
  const repo = deps.repository || repository;
  const scope = deps.scope || "ip-recovery";
  const limit = deps.limit ?? RECOVERY_LIMIT;
  const windowMs = deps.windowMs ?? RECOVERY_WINDOW_MS;
  const lockMs = deps.lockMs ?? RECOVERY_LOCK_MS;
  return async function recoveryRateLimiter(req, _res, next) {
    try {
      const ip = req.ip || "unknown";
      const key = `${scope}:${ip}`;

      const lockState = await repo.getLockState(key);
      if (lockState.lockedUntil && lockState.lockedUntil > new Date()) {
        next(new AppError("too many recovery attempts, try again later", 429, "RECOVERY_RATE_LIMIT"));
        return;
      }

      const state = await repo.incrementAndCheck(key, scope, windowMs);
      if (state.count > limit) {
        await repo.setLockedUntil(
          key,
          scope,
          new Date(state.now.getTime() + lockMs)
        );
        next(new AppError("too many recovery attempts, try again later", 429, "RECOVERY_RATE_LIMIT"));
        return;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

// Backwards-compatible exports — these are the actual middleware instances
// used by the route layer. They each instantiate against the shared
// MongoRateLimitRepository.
export const sessionRateLimiter = createSessionRateLimiter();
export const recoveryRateLimiter = createRecoveryRateLimiter();
export const questionLookupRateLimiter = createRecoveryRateLimiter({
  scope: "ip-question-lookup",
  limit: QUESTION_LOOKUP_LIMIT
});
