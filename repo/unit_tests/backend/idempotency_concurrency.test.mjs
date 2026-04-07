import test from "node:test";
import assert from "node:assert/strict";
import { IdempotencyService } from "../../apps/backend/src/application/services/IdempotencyService.js";

/**
 * In-memory stub of MongoIdempotencyRepository that implements the same
 * atomic-reservation contract: the (key, userId, action) tuple is unique
 * and the FIRST `reserve()` call wins. Concurrent reservations from the
 * same logical key see `created: false` and the existing record.
 *
 * This stub deliberately uses a synchronous Map check followed by an
 * async insert with a 0-tick delay so test code can interleave two
 * `IdempotencyService.execute` calls and exercise the lock semantics
 * without needing a live Mongo container.
 */
function makeStubIdempotencyRepository() {
  const records = new Map();
  function key({ key: k, userId, action }) {
    return `${userId}::${action}::${k}`;
  }
  return {
    records,
    async reserve({ key: k, userId, action, recordId, now }) {
      // Yield once so two concurrent callers can race the check.
      await Promise.resolve();
      const composite = key({ key: k, userId, action });
      if (records.has(composite)) {
        return { created: false, record: records.get(composite) };
      }
      const record = {
        _id: recordId,
        key: k,
        userId,
        action,
        status: "pending",
        statusCode: null,
        responseBody: null,
        createdAt: now,
        updatedAt: now
      };
      records.set(composite, record);
      return { created: true, record };
    },
    async findByKey({ key: k, userId, action }) {
      return records.get(key({ key: k, userId, action })) || null;
    },
    async markCompleted({ key: k, userId, action, statusCode, responseBody, now }) {
      const composite = key({ key: k, userId, action });
      const record = records.get(composite);
      if (!record) {
        return null;
      }
      record.status = "completed";
      record.statusCode = statusCode;
      record.responseBody = responseBody;
      record.updatedAt = now;
      return record;
    },
    async markFailed({ key: k, userId, action }) {
      const composite = key({ key: k, userId, action });
      const record = records.get(composite);
      if (record && record.status === "pending") {
        records.delete(composite);
      }
    }
  };
}

test("idempotency reservation runs the handler exactly once for two concurrent identical requests", async () => {
  const repo = makeStubIdempotencyRepository();
  const service = new IdempotencyService(repo);
  let handlerInvocations = 0;
  const handler = async () => {
    handlerInvocations += 1;
    // Simulate a slow handler so the second caller's poll loop is
    // exercised. Anything > PENDING_POLL_INTERVAL_MS (50 ms) is enough.
    await new Promise((resolve) => setTimeout(resolve, 80));
    return { statusCode: 200, body: { result: "ok", invocation: handlerInvocations } };
  };

  const opts = {
    key: "concurrent-key-1",
    userId: "u1",
    action: "test:concurrent",
    handler
  };

  const [first, second] = await Promise.all([
    service.execute(opts),
    service.execute(opts)
  ]);

  assert.equal(handlerInvocations, 1, "handler must run exactly once across both concurrent calls");

  // One caller is the original; the other observed the in-flight
  // reservation and waited for the cached result. Both must agree on
  // the response body.
  const replays = [first, second].filter((r) => r.idempotentReplay === true);
  const originals = [first, second].filter((r) => r.idempotentReplay === false);
  assert.equal(originals.length, 1, "exactly one caller is the original handler invocation");
  assert.equal(replays.length, 1, "exactly one caller sees an idempotent replay");

  assert.deepEqual(first.body, second.body, "both callers must observe the identical response body");
  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
});

test("idempotency reservation deletes the pending record on handler failure so retries can proceed", async () => {
  const repo = makeStubIdempotencyRepository();
  const service = new IdempotencyService(repo);

  let runs = 0;
  const failingHandler = async () => {
    runs += 1;
    if (runs === 1) {
      throw new Error("transient");
    }
    return { statusCode: 200, body: { ok: true } };
  };

  const opts = {
    key: "retry-after-failure",
    userId: "u2",
    action: "test:retry",
    handler: failingHandler
  };

  await assert.rejects(() => service.execute(opts), /transient/);
  assert.equal(repo.records.size, 0, "pending reservation must be removed after a failed handler");

  const second = await service.execute(opts);
  assert.equal(runs, 2, "second invocation must actually re-run the handler");
  assert.equal(second.idempotentReplay, false);
  assert.deepEqual(second.body, { ok: true });
});

test("idempotency replay returns cached body without re-invoking the handler", async () => {
  const repo = makeStubIdempotencyRepository();
  const service = new IdempotencyService(repo);

  let runs = 0;
  const handler = async () => {
    runs += 1;
    return { statusCode: 201, body: { id: "abc123" } };
  };

  const opts = {
    key: "cached-replay",
    userId: "u3",
    action: "test:replay",
    handler
  };

  const first = await service.execute(opts);
  const second = await service.execute(opts);

  assert.equal(runs, 1, "second sequential call must replay the cached response");
  assert.equal(first.idempotentReplay, false);
  assert.equal(second.idempotentReplay, true);
  assert.deepEqual(first.body, second.body);
});

test("idempotency rejects missing or non-string key", async () => {
  const repo = makeStubIdempotencyRepository();
  const service = new IdempotencyService(repo);
  const handler = async () => ({ statusCode: 200, body: {} });

  await assert.rejects(
    () => service.execute({ key: undefined, userId: "u1", action: "x", handler }),
    { code: "IDEMPOTENCY_REQUIRED" }
  );
  await assert.rejects(
    () => service.execute({ key: 123, userId: "u1", action: "x", handler }),
    { code: "IDEMPOTENCY_REQUIRED" }
  );
});
