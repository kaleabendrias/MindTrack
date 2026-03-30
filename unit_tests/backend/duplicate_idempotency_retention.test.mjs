import test from "node:test";
import assert from "node:assert/strict";
import { IdempotencyService } from "../../apps/backend/src/application/services/IdempotencyService.js";
import { RetentionService } from "../../apps/backend/src/application/services/RetentionService.js";
import { phoneLast4, scoreDuplicate } from "../../apps/backend/src/application/services/mindTrackScoring.js";

test("duplicate weighting uses name + dob + phone last4", () => {
  const candidate = {
    name: "Jordan Miles",
    dob: "1990-05-14T00:00:00.000Z",
    phoneLast4: "0144"
  };
  const payload = {
    name: "Jordan Miles",
    dob: "1990-05-14",
    phone: "+1-212-555-0144"
  };
  assert.equal(phoneLast4(payload.phone), "0144");
  assert.equal(scoreDuplicate(candidate, payload), 1);
});

test("idempotency replays first response for same key", async () => {
  const records = new Map();
  const service = new IdempotencyService({
    findByKey: async ({ key, userId, action }) => records.get(`${key}|${userId}|${action}`) || null,
    create: async (payload) => {
      records.set(`${payload.key}|${payload.userId}|${payload.action}`, payload);
      return payload;
    }
  });

  const first = await service.execute({
    key: "idem-1",
    userId: "u1",
    action: "sign:e1",
    handler: async () => ({ statusCode: 200, body: { ok: true, value: 1 } })
  });

  const second = await service.execute({
    key: "idem-1",
    userId: "u1",
    action: "sign:e1",
    handler: async () => ({ statusCode: 200, body: { ok: true, value: 999 } })
  });

  assert.equal(first.idempotentReplay, false);
  assert.equal(second.idempotentReplay, true);
  assert.equal(second.body.value, 1);
});

test("retention and legal-hold checks block modifications", () => {
  const now = new Date("2026-03-30T00:00:00.000Z");

  const hold = RetentionService.canModifyRecord({ legalHold: true, retentionUntil: null }, now);
  assert.equal(hold.allowed, false);
  assert.equal(hold.reason, "legal_hold");

  const retention = RetentionService.canModifyRecord(
    { legalHold: false, retentionUntil: "2026-04-01T00:00:00.000Z" },
    now
  );
  assert.equal(retention.allowed, true);
  assert.equal(retention.reason, "ok");

  const allowed = RetentionService.canModifyRecord(
    { legalHold: false, retentionUntil: "2026-03-01T00:00:00.000Z" },
    now
  );
  assert.equal(allowed.allowed, false);
  assert.equal(allowed.reason, "retention_expired_archive_locked");
});
