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
  // The IdempotencyService now uses an atomic reserve-then-fulfill
  // contract instead of the legacy find-then-create. This stub
  // implements the new interface (reserve/findByKey/markCompleted/
  // markFailed) so we exercise the actual code path the production
  // MongoIdempotencyRepository uses.
  const records = new Map();
  const compositeKey = ({ key, userId, action }) => `${key}|${userId}|${action}`;
  const service = new IdempotencyService({
    async reserve({ key, userId, action, recordId, now }) {
      const k = compositeKey({ key, userId, action });
      if (records.has(k)) {
        return { created: false, record: records.get(k) };
      }
      const record = {
        _id: recordId,
        key,
        userId,
        action,
        status: "pending",
        statusCode: null,
        responseBody: null,
        createdAt: now,
        updatedAt: now
      };
      records.set(k, record);
      return { created: true, record };
    },
    async findByKey({ key, userId, action }) {
      return records.get(compositeKey({ key, userId, action })) || null;
    },
    async markCompleted({ key, userId, action, statusCode, responseBody, now }) {
      const record = records.get(compositeKey({ key, userId, action }));
      if (!record) {
        return null;
      }
      record.status = "completed";
      record.statusCode = statusCode;
      record.responseBody = responseBody;
      record.updatedAt = now;
      return record;
    },
    async markFailed({ key, userId, action }) {
      const k = compositeKey({ key, userId, action });
      const record = records.get(k);
      if (record && record.status === "pending") {
        records.delete(k);
      }
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
