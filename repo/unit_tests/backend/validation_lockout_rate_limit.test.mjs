import test from "node:test";
import assert from "node:assert/strict";
import { AuthService } from "../../apps/backend/src/application/services/AuthService.js";
import { enforcePasswordPolicy } from "../../apps/backend/src/application/security/passwordPolicy.js";
import { sessionRateLimiter, recoveryRateLimiter } from "../../apps/backend/src/interfaces/http/middleware/rateLimitMiddleware.js";

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

test("session rate limiter blocks above 60 per minute", () => {
  const req = { user: { sessionId: "s-unit" } };
  const res = {};
  let blocked = false;

  for (let i = 0; i < 61; i += 1) {
    sessionRateLimiter(req, res, (error) => {
      if (error) {
        blocked = true;
      }
    });
  }

  assert.equal(blocked, true);
});

test("recovery rate limiter blocks after 5 attempts from same IP", () => {
  let blocked = false;
  for (let i = 0; i < 8; i += 1) {
    const req = { ip: "192.168.99.99" };
    const res = {};
    recoveryRateLimiter(req, res, (error) => {
      if (error && error.statusCode === 429) {
        blocked = true;
      }
    });
  }
  assert.equal(blocked, true, "should block after 5+ recovery attempts");
});

test("recovery rate limiter allows different IPs independently", () => {
  let ip1Blocked = false;
  let ip2Blocked = false;

  for (let i = 0; i < 3; i += 1) {
    recoveryRateLimiter({ ip: "10.0.0.1" }, {}, (error) => {
      if (error) {
        ip1Blocked = true;
      }
    });
    recoveryRateLimiter({ ip: "10.0.0.2" }, {}, (error) => {
      if (error) {
        ip2Blocked = true;
      }
    });
  }

  assert.equal(ip1Blocked, false, "3 attempts from IP1 should not be blocked");
  assert.equal(ip2Blocked, false, "3 attempts from IP2 should not be blocked");
});

test("failed recovery increments user failure count and triggers lockout", async () => {
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

  await assert.rejects(
    () => authService.recoverPasswordWithQuestion({
      username: "testuser",
      question: "wrong question",
      answer: "any",
      newPassword: "NewPass12345678"
    }),
    { message: "security question mismatch" }
  );

  assert.equal(updates.length, 1);
  assert.equal(updates[0].failedLoginAttempts, 5);
  assert.ok(updates[0].lockedUntil instanceof Date, "should lock after reaching threshold");
  assert.equal(auditLogs.length, 1);
  assert.match(auditLogs[0].reason, /failed recovery attempt/);
});

test("locked account rejects recovery attempts", async () => {
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
      update: async () => {},
      findById: async () => null
    },
    sessionRepository: { create: async () => {}, findById: async () => null, update: async () => {} },
    auditService: { logAction: async () => {} }
  });

  await assert.rejects(
    () => authService.recoverPasswordWithQuestion({
      username: "lockeduser",
      question: "test?",
      answer: "any",
      newPassword: "NewPass12345678"
    }),
    { message: "account is temporarily locked" }
  );
});
