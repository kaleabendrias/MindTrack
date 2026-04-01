import test from "node:test";
import assert from "node:assert/strict";
import { AuthService } from "../../apps/backend/src/application/services/AuthService.js";
import { encryptValue, decryptValue } from "../../apps/backend/src/infrastructure/security/fieldCrypto.js";
import {
  issueAccessToken,
  issueRefreshToken,
  verifyAccessToken,
  verifyRefreshToken
} from "../../apps/backend/src/infrastructure/security/tokenService.js";

test("token lifecycle issues and verifies access/refresh tokens", () => {
  const access = issueAccessToken({
    userId: "u1",
    sessionId: "s1",
    role: "clinician",
    permissions: []
  });
  const refresh = issueRefreshToken({ userId: "u1", sessionId: "s1" });

  const accessPayload = verifyAccessToken(access);
  const refreshPayload = verifyRefreshToken(refresh);

  assert.equal(accessPayload.sub, "u1");
  assert.equal(refreshPayload.sub, "u1");
  assert.equal(accessPayload.sid, "s1");
  assert.equal(refreshPayload.sid, "s1");
});

test("field encryption and decryption roundtrip", () => {
  const encrypted = encryptValue("+1-212-555-1234");
  assert.ok(encrypted.iv);
  assert.ok(encrypted.tag);
  assert.ok(encrypted.data);

  const plain = decryptValue(encrypted);
  assert.equal(plain, "+1-212-555-1234");
});

test("PII masking defaults without PII permission", () => {
  const authService = new AuthService({
    userRepository: {},
    sessionRepository: {},
    auditService: { logAction: async () => {} }
  });

  const masked = authService.sanitizeUser(
    {
      id: "u1",
      username: "clinician",
      role: "clinician",
      permissions: [],
      phone: "+1-555-0199",
      address: "100 Any Street",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastLoginAt: null
    },
    false
  );

  assert.equal(masked.address, "***masked***");
  assert.ok(masked.phone.endsWith("0199"));
  assert.notEqual(masked.phone, "+1-555-0199");
});
