import test from "node:test";
import assert from "node:assert/strict";
import { AuthService } from "../../apps/backend/src/application/services/AuthService.js";
import { enforcePasswordPolicy } from "../../apps/backend/src/application/security/passwordPolicy.js";
import { hashSecret, verifySecret } from "../../apps/backend/src/infrastructure/security/passwordHasher.js";
import {
  createSessionRateLimiter,
  createRecoveryRateLimiter
} from "../../apps/backend/src/interfaces/http/middleware/rateLimitMiddleware.js";

// Pure in-memory stub of MongoRateLimitRepository, used to exercise the
// limiter logic without requiring a live Mongo connection.
function makeStubRateLimitRepository() {
  const buckets = new Map();
  return {
    async incrementAndCheck(key, scope, windowMs) {
      const now = new Date();
      const cutoff = now.getTime() - windowMs;
      const existing = buckets.get(key);
      if (
        existing &&
        existing.windowStart.getTime() >= cutoff &&
        (!existing.lockedUntil || existing.lockedUntil <= now)
      ) {
        existing.count += 1;
        existing.scope = scope;
        return { ...existing, now };
      }
      const fresh = { windowStart: now, count: 1, lockedUntil: null, scope };
      buckets.set(key, fresh);
      return { ...fresh, now };
    },
    async setLockedUntil(key, scope, lockedUntil) {
      const existing = buckets.get(key) || {
        windowStart: new Date(),
        count: 0,
        scope
      };
      existing.lockedUntil = lockedUntil;
      buckets.set(key, existing);
    },
    async getLockState(key) {
      const existing = buckets.get(key);
      return { lockedUntil: existing?.lockedUntil || null };
    }
  };
}

test("password policy rejects weak password", () => {
  assert.throws(() => enforcePasswordPolicy("short"));
  assert.doesNotThrow(() => enforcePasswordPolicy("LongEnough123"));
});

test("account locks after failed login threshold", async () => {
  const updates = [];
  const authService = new AuthService({
    userRepository: {
      findByUsername: async () => ({
        id: "u1",
        username: "clinician",
        role: "clinician",
        permissions: [],
        passwordHash: "salt:invalid",
        failedLoginAttempts: 4,
        lockedUntil: null
      }),
      update: async (_id, payload) => updates.push(payload),
      findById: async () => null
    },
    sessionRepository: { create: async () => {}, findById: async () => null, update: async () => {} },
    auditService: { logAction: async () => {} }
  });

  await assert.rejects(
    () => authService.login({ username: "clinician", password: "wrongPass123", ipAddress: "127.0.0.1", userAgent: "test" })
  );
  assert.equal(updates.length, 1);
  assert.equal(updates[0].failedLoginAttempts, 5);
  assert.ok(updates[0].lockedUntil instanceof Date);
});

test("session rate limiter blocks above 60 per minute", async () => {
  const repository = makeStubRateLimitRepository();
  const limiter = createSessionRateLimiter({ repository });
  const req = { user: { sessionId: "s-unit" } };
  const res = {};
  let blocked = false;

  for (let i = 0; i < 61; i += 1) {
    await new Promise((resolve) => {
      limiter(req, res, (error) => {
        if (error) {
          blocked = true;
        }
        resolve();
      });
    });
  }

  assert.equal(blocked, true);
});

test("recovery rate limiter blocks after 5 attempts from same IP", async () => {
  const repository = makeStubRateLimitRepository();
  const limiter = createRecoveryRateLimiter({ repository });
  let blocked = false;
  for (let i = 0; i < 8; i += 1) {
    const req = { ip: "192.168.99.99" };
    const res = {};
    await new Promise((resolve) => {
      limiter(req, res, (error) => {
        if (error && error.statusCode === 429) {
          blocked = true;
        }
        resolve();
      });
    });
  }
  assert.equal(blocked, true, "should block after 5+ recovery attempts");
});

test("recovery rate limiter allows different IPs independently", async () => {
  const repository = makeStubRateLimitRepository();
  const limiter = createRecoveryRateLimiter({ repository });
  let ip1Blocked = false;
  let ip2Blocked = false;

  for (let i = 0; i < 3; i += 1) {
    await new Promise((resolve) => {
      limiter({ ip: "10.0.0.1" }, {}, (error) => {
        if (error) {
          ip1Blocked = true;
        }
        resolve();
      });
    });
    await new Promise((resolve) => {
      limiter({ ip: "10.0.0.2" }, {}, (error) => {
        if (error) {
          ip2Blocked = true;
        }
        resolve();
      });
    });
  }

  assert.equal(ip1Blocked, false, "3 attempts from IP1 should not be blocked");
  assert.equal(ip2Blocked, false, "3 attempts from IP2 should not be blocked");
});

test("failed recovery silently increments failure count without leaking outcome", async () => {
  // Uniform-response recovery: a wrong-question attempt now returns
  // { success: true } (instead of throwing) so an external attacker cannot
  // distinguish a missed question from a missed user. The failure counter
  // is still incremented internally so account-lockout still applies on
  // the next /login attempt.
  const updates = [];
  const auditLogs = [];
  const authService = new AuthService({
    userRepository: {
      findByUsername: async () => ({
        id: "u-recover",
        username: "testuser",
        role: "client",
        permissions: [],
        passwordHash: "hash",
        failedLoginAttempts: 4,
        lockedUntil: null,
        securityQuestions: [{ question: "test question?", answerHash: "wrong-hash" }]
      }),
      update: async (_id, payload) => updates.push(payload),
      findById: async () => null
    },
    sessionRepository: { create: async () => {}, findById: async () => null, update: async () => {} },
    auditService: { logAction: async (entry) => auditLogs.push(entry) }
  });

  const result = await authService.recoverPasswordWithQuestion({
    username: "testuser",
    question: "wrong question",
    answer: "any",
    newPassword: "NewPass12345678"
  });
  assert.deepEqual(result, { success: true, reset: false }, "must return uniform success with reset: false");

  assert.equal(updates.length, 1);
  assert.equal(updates[0].failedLoginAttempts, 5);
  assert.ok(updates[0].lockedUntil instanceof Date, "should lock after reaching threshold");
  assert.equal(auditLogs.length, 1);
  assert.match(auditLogs[0].reason, /failed recovery attempt/);
});

test("locked account does not leak lock state on recovery", async () => {
  // Uniform-response recovery: a locked account must NOT be disclosed via
  // a 423 ACCOUNT_LOCKED response on the unauthenticated path.
  const updates = [];
  const authService = new AuthService({
    userRepository: {
      findByUsername: async () => ({
        id: "u-locked",
        username: "lockeduser",
        role: "client",
        permissions: [],
        passwordHash: "hash",
        failedLoginAttempts: 5,
        lockedUntil: new Date(Date.now() + 15 * 60 * 1000),
        securityQuestions: [{ question: "test?", answerHash: "hash" }]
      }),
      update: async (_id, payload) => updates.push(payload),
      findById: async () => null
    },
    sessionRepository: { create: async () => {}, findById: async () => null, update: async () => {} },
    auditService: { logAction: async () => {} }
  });

  const result = await authService.recoverPasswordWithQuestion({
    username: "lockeduser",
    question: "test?",
    answer: "any",
    newPassword: "NewPass12345678"
  });
  assert.deepEqual(result, { success: true, reset: false }, "must return uniform success with reset: false");
  assert.equal(updates.length, 0, "must not modify a locked account on this path");
});

test("nonexistent user yields the same uniform response on recovery", async () => {
  const authService = new AuthService({
    userRepository: {
      findByUsername: async () => null,
      update: async () => {
        throw new Error("must not be called");
      },
      findById: async () => null
    },
    sessionRepository: { create: async () => {}, findById: async () => null, update: async () => {} },
    auditService: { logAction: async () => {} }
  });

  const result = await authService.recoverPasswordWithQuestion({
    username: "no_such_user",
    question: "anything",
    answer: "anything",
    newPassword: "NewPass12345678"
  });
  assert.deepEqual(result, { success: true, reset: false });
});

test("malformed/invalid username also yields the uniform response", async () => {
  const authService = new AuthService({
    userRepository: {
      findByUsername: async () => {
        throw new Error("must not be called");
      },
      update: async () => {
        throw new Error("must not be called");
      },
      findById: async () => null
    },
    sessionRepository: { create: async () => {}, findById: async () => null, update: async () => {} },
    auditService: { logAction: async () => {} }
  });

  const result = await authService.recoverPasswordWithQuestion({
    username: "!!", // fails normalizeUsername
    question: "anything",
    answer: "anything",
    newPassword: "NewPass12345678"
  });
  assert.deepEqual(result, { success: true, reset: false });
});

test("successful recovery updates password hash and returns reset: true", async () => {
  // Create a real answer hash so verifySecret will pass inside AuthService.
  const answerHash = await hashSecret("myrecoveryanswer");
  const originalPasswordHash = await hashSecret("OldPassword12345");

  const updates = [];
  const auditLogs = [];
  const authService = new AuthService({
    userRepository: {
      findByUsername: async () => ({
        id: "u-recover-ok",
        username: "recoveruser",
        role: "client",
        permissions: [],
        passwordHash: originalPasswordHash,
        failedLoginAttempts: 0,
        lockedUntil: null,
        securityQuestions: [{ question: "What is your pet's name?", answerHash }]
      }),
      update: async (_id, payload) => updates.push(payload),
      findById: async () => null
    },
    sessionRepository: { create: async () => {}, findById: async () => null, update: async () => {} },
    auditService: { logAction: async (entry) => auditLogs.push(entry) }
  });

  const result = await authService.recoverPasswordWithQuestion({
    username: "recoveruser",
    question: "What is your pet's name?",
    answer: "myrecoveryanswer",
    newPassword: "BrandNewSecurePass99"
  });

  // Must signal a genuine reset so the frontend can show the success toast.
  assert.deepEqual(result, { success: true, reset: true });

  // Password hash must have been updated in the repository.
  assert.equal(updates.length, 1);
  assert.ok(typeof updates[0].passwordHash === "string");
  assert.notEqual(updates[0].passwordHash, originalPasswordHash,
    "password hash must differ after recovery");
  // Verify the new hash actually corresponds to the new password.
  const newHashValid = await verifySecret("BrandNewSecurePass99", updates[0].passwordHash);
  assert.equal(newHashValid, true, "new hash must verify against the new password");
  assert.equal(updates[0].failedLoginAttempts, 0);
  assert.equal(updates[0].lockedUntil, null);
  assert.equal(updates[0].mustRotatePassword, false);

  // Audit log must record the recovery action.
  assert.equal(auditLogs.length, 1);
  assert.equal(auditLogs[0].action, "update");
  assert.equal(auditLogs[0].entityType, "user");
  assert.equal(auditLogs[0].reason, "security question recovery");
});

test("getSecurityQuestions always returns the uniform generic label, even for real users with configured questions", async () => {
  // Security fix: the endpoint must never disclose whether the username
  // exists or which specific question that account uses. A real user with
  // two configured questions must receive the same single generic challenge
  // label as a non-existent user — indistinguishable to any caller.
  const authService = new AuthService({
    userRepository: {
      findByUsername: async () => ({
        id: "u-sq",
        username: "squser",
        role: "client",
        permissions: [],
        passwordHash: "x:y",
        securityQuestions: [
          { question: "What is your pet's name?", answerHash: "salt:hash" },
          { question: "What city were you born in?", answerHash: "salt2:hash2" }
        ]
      }),
      update: async () => {},
      findById: async () => null
    },
    sessionRepository: { create: async () => {}, findById: async () => null, update: async () => {} },
    auditService: { logAction: async () => {} }
  });

  const questions = await authService.getSecurityQuestions("squser");
  // Must return exactly one generic entry — never the user's configured questions.
  assert.equal(questions.length, 1);
  assert.equal(questions[0].question, "What is your account recovery question?");
  // Must never expose the answer hash.
  assert.equal(questions[0].answerHash, undefined);
});

test("getSecurityQuestions returns generic fallback for nonexistent users", async () => {
  const authService = new AuthService({
    userRepository: {
      findByUsername: async () => null,
      update: async () => {},
      findById: async () => null
    },
    sessionRepository: { create: async () => {}, findById: async () => null, update: async () => {} },
    auditService: { logAction: async () => {} }
  });

  const questions = await authService.getSecurityQuestions("no_such_user");
  assert.equal(questions.length, 1);
  assert.equal(questions[0].question, "What is your account recovery question?");
});
