import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createRequestSigningMiddleware, NONCE_TTL_MS } from "../../apps/backend/src/interfaces/http/middleware/requestSigningMiddleware.js";
import { createSigningPayload } from "../../apps/backend/src/infrastructure/security/requestSigner.js";

// Stub session repository that emulates the persistent nonce ledger.
function makeStubSessionRepository() {
  const ledgers = new Map();
  return {
    ledgers,
    async recordNonce(sessionId, nonce, ttlMs) {
      const now = Date.now();
      const cutoff = now - ttlMs;
      const set = ledgers.get(sessionId) || new Map();
      // Prune expired
      for (const [n, seenAt] of set) {
        if (seenAt < cutoff) {
          set.delete(n);
        }
      }
      if (set.has(nonce)) {
        ledgers.set(sessionId, set);
        return false;
      }
      set.set(nonce, now);
      ledgers.set(sessionId, set);
      return true;
    },
    async update(_id, _payload) {}
  };
}

function makeSignedRequest({ secret, sessionId, method = "POST", path = "/api/v1/some", body = "{}", nonce, csrfToken }) {
  const timestamp = Date.now();
  const payload = createSigningPayload({ method, path, timestamp, nonce, body });
  const signature = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return {
    method,
    originalUrl: path,
    body: JSON.parse(body),
    headers: {
      "x-signature": signature,
      "x-signature-timestamp": String(timestamp),
      "x-signature-nonce": nonce,
      "x-csrf-token": csrfToken
    },
    get(header) {
      return this.headers[header.toLowerCase()];
    },
    session: {
      id: sessionId,
      requestSigningKey: secret,
      csrfToken
    }
  };
}

function runMiddleware(middleware, req) {
  return new Promise((resolve) => {
    middleware(req, {}, (err) => resolve(err));
  });
}

test("requestSigningMiddleware rejects a non-consecutive nonce replay within TTL", async () => {
  const sessionRepository = makeStubSessionRepository();
  const middleware = createRequestSigningMiddleware({ sessionRepository });
  const secret = "x".repeat(64);
  const sessionId = "s-replay";
  const csrfToken = "csrf-tok-1";

  const nonceA = crypto.randomUUID();
  const nonceB = crypto.randomUUID();
  const nonceC = crypto.randomUUID();

  // First request with nonceA — accepted.
  const req1 = makeSignedRequest({ secret, sessionId, nonce: nonceA, csrfToken });
  const err1 = await runMiddleware(middleware, req1);
  assert.equal(err1, undefined, "nonceA must be accepted");

  // Second request with a DIFFERENT nonce (nonceB) — accepted.
  const req2 = makeSignedRequest({ secret, sessionId, nonce: nonceB, csrfToken });
  const err2 = await runMiddleware(middleware, req2);
  assert.equal(err2, undefined, "nonceB must be accepted");

  // Third request with another fresh nonce (nonceC) — accepted.
  const req3 = makeSignedRequest({ secret, sessionId, nonce: nonceC, csrfToken });
  const err3 = await runMiddleware(middleware, req3);
  assert.equal(err3, undefined, "nonceC must be accepted");

  // Now REPLAY nonceA (the FIRST nonce, not the most recent). The naive
  // "lastNonce" check would have allowed this. The new ledger must catch it.
  const replay = makeSignedRequest({ secret, sessionId, nonce: nonceA, csrfToken });
  const replayErr = await runMiddleware(middleware, replay);
  assert.ok(replayErr, "non-consecutive replay must be rejected");
  assert.equal(replayErr.statusCode, 401);
  assert.equal(replayErr.code, "REPLAY_DETECTED");

  // And replaying nonceB (the middle nonce) must also be rejected.
  const replayB = makeSignedRequest({ secret, sessionId, nonce: nonceB, csrfToken });
  const replayBErr = await runMiddleware(middleware, replayB);
  assert.ok(replayBErr);
  assert.equal(replayBErr.code, "REPLAY_DETECTED");
});

test("requestSigningMiddleware allows a nonce after its TTL has elapsed", async () => {
  const sessionRepository = makeStubSessionRepository();
  // Use a very short TTL so we can simulate expiry without waiting.
  const middleware = createRequestSigningMiddleware({ sessionRepository, nonceTtlMs: 1 });
  const secret = "y".repeat(64);
  const sessionId = "s-ttl";
  const csrfToken = "csrf-tok-2";

  const nonce = crypto.randomUUID();
  const req1 = makeSignedRequest({ secret, sessionId, nonce, csrfToken });
  const err1 = await runMiddleware(middleware, req1);
  assert.equal(err1, undefined);

  // Wait long enough for the entry to be older than the TTL window.
  await new Promise((resolve) => setTimeout(resolve, 5));

  const req2 = makeSignedRequest({ secret, sessionId, nonce, csrfToken });
  const err2 = await runMiddleware(middleware, req2);
  assert.equal(err2, undefined, "nonce must be reusable after TTL");
});

test("NONCE_TTL_MS is exported and is at least the signature skew window", () => {
  assert.ok(typeof NONCE_TTL_MS === "number");
  assert.ok(NONCE_TTL_MS >= 5 * 60 * 1000, "TTL must cover the request-signer skew window");
});
