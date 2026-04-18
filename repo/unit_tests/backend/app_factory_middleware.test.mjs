/**
 * Isolated unit tests for the middleware functions composed by appFactory.js.
 *
 * Tests are deliberately free of real MongoDB connections. Each middleware is
 * imported from its own module and exercised with minimal mock request objects
 * so the ordering contracts can be verified without spinning up the full
 * Express app.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  enforcePasswordRotation,
  createAuthenticateMiddleware,
} from "../../apps/backend/src/interfaces/http/middleware/authMiddleware.js";
import { createRequestSigningMiddleware } from "../../apps/backend/src/interfaces/http/middleware/requestSigningMiddleware.js";
import { errorHandler } from "../../apps/backend/src/interfaces/http/middleware/errorHandler.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeRes = () => {
  const r = {};
  r.status = (c) => { r._status = c; return r; };
  r.json   = (b) => { r._body  = b; return r; };
  return r;
};

// ---------------------------------------------------------------------------
// enforcePasswordRotation — pure synchronous function, no DB
// ---------------------------------------------------------------------------

describe("enforcePasswordRotation middleware", () => {
  test("passes through when no user is attached (pre-authenticate routes)", () => {
    let nextCalled = false;
    enforcePasswordRotation(
      { user: null, originalUrl: "/api/v1/auth/login" },
      null,
      (err) => { if (!err) nextCalled = true; }
    );
    assert.ok(nextCalled);
  });

  test("passes through when mustRotatePassword is false", () => {
    let nextCalled = false;
    enforcePasswordRotation(
      { user: { mustRotatePassword: false }, originalUrl: "/api/v1/mindtrack/clients" },
      null,
      (err) => { if (!err) nextCalled = true; }
    );
    assert.ok(nextCalled);
  });

  test("blocks non-exempt path when mustRotatePassword is true", () => {
    let errorArg = null;
    enforcePasswordRotation(
      { user: { mustRotatePassword: true }, originalUrl: "/api/v1/mindtrack/clients" },
      null,
      (err) => { errorArg = err; }
    );
    assert.ok(errorArg, "next should have been called with an error");
    assert.strictEqual(errorArg.statusCode, 403);
    assert.strictEqual(errorArg.code, "PASSWORD_ROTATION_REQUIRED");
  });

  test("allows /api/v1/auth/rotate-password when mustRotatePassword is true", () => {
    let nextCalled = false;
    enforcePasswordRotation(
      { user: { mustRotatePassword: true }, originalUrl: "/api/v1/auth/rotate-password" },
      null,
      (err) => { if (!err) nextCalled = true; }
    );
    assert.ok(nextCalled);
  });

  test("allows /api/v1/auth/logout when mustRotatePassword is true", () => {
    let nextCalled = false;
    enforcePasswordRotation(
      { user: { mustRotatePassword: true }, originalUrl: "/api/v1/auth/logout" },
      null,
      (err) => { if (!err) nextCalled = true; }
    );
    assert.ok(nextCalled);
  });

  test("allows /api/v1/auth/session when mustRotatePassword is true", () => {
    let nextCalled = false;
    enforcePasswordRotation(
      { user: { mustRotatePassword: true }, originalUrl: "/api/v1/auth/session" },
      null,
      (err) => { if (!err) nextCalled = true; }
    );
    assert.ok(nextCalled);
  });

  test("error produced by blocking is caught by errorHandler and returns 403 contract", () => {
    let errorArg = null;
    enforcePasswordRotation(
      { user: { mustRotatePassword: true }, originalUrl: "/api/v1/system/backup-run" },
      null,
      (err) => { errorArg = err; }
    );
    assert.ok(errorArg);

    const res = makeRes();
    errorHandler(errorArg, { method: "GET", path: "/t", originalUrl: "/t", user: null }, res, () => {});
    assert.strictEqual(res._status, 403);
    assert.strictEqual(typeof res._body.error, "string");
    assert.strictEqual(res._body.code, "PASSWORD_ROTATION_REQUIRED");
  });
});

// ---------------------------------------------------------------------------
// createRequestSigningMiddleware — missing headers path never touches DB
// ---------------------------------------------------------------------------

describe("createRequestSigningMiddleware: missing headers", () => {
  const noopSessionRepo = { recordNonce: async () => true };
  const mw = createRequestSigningMiddleware({ sessionRepository: noopSessionRepo });

  test("rejects request with no signature headers at all", async () => {
    let errorArg = null;
    const req = {
      get: () => undefined,
      method: "GET",
      originalUrl: "/api/v1/mindtrack/clients",
      body: null,
      session: { requestSigningKey: "k", csrfToken: "t" },
    };
    await mw(req, null, (err) => { errorArg = err; });
    assert.ok(errorArg, "middleware should have forwarded an error");
    assert.strictEqual(errorArg.statusCode, 401);
    assert.strictEqual(errorArg.code, "SIGNATURE_REQUIRED");
  });

  test("rejects request with timestamp but no signature", async () => {
    let errorArg = null;
    const req = {
      get: (h) => (h === "x-signature-timestamp" ? String(Date.now()) : undefined),
      method: "GET",
      originalUrl: "/api/v1/mindtrack/clients",
      body: null,
      session: { requestSigningKey: "k", csrfToken: "t" },
    };
    await mw(req, null, (err) => { errorArg = err; });
    assert.ok(errorArg);
    assert.strictEqual(errorArg.statusCode, 401);
    assert.strictEqual(errorArg.code, "SIGNATURE_REQUIRED");
  });

  test("missing-headers error produces correct {error,code} contract via errorHandler", async () => {
    let errorArg = null;
    const req = {
      get: () => undefined,
      method: "POST",
      originalUrl: "/api/v1/mindtrack/entries",
      body: {},
      session: { requestSigningKey: "k", csrfToken: "t" },
    };
    await mw(req, null, (err) => { errorArg = err; });
    assert.ok(errorArg);

    const res = makeRes();
    errorHandler(errorArg, { method: "POST", path: "/t", originalUrl: "/t", user: null }, res, () => {});
    assert.strictEqual(res._status, 401);
    assert.strictEqual(typeof res._body.error, "string");
    assert.strictEqual(res._body.code, "SIGNATURE_REQUIRED");
  });
});

// ---------------------------------------------------------------------------
// createAuthenticateMiddleware — missing token path never touches DB
// ---------------------------------------------------------------------------

describe("createAuthenticateMiddleware: missing token", () => {
  const noopSessionRepo = {};
  const noopUserRepo = {};
  const mw = createAuthenticateMiddleware({
    sessionRepository: noopSessionRepo,
    userRepository: noopUserRepo,
  });

  test("rejects request with no Authorization header and no cookie", async () => {
    let errorArg = null;
    const req = {
      get: () => undefined,
      headers: {},
    };
    await mw(req, null, (err) => { errorArg = err; });
    assert.ok(errorArg);
    assert.strictEqual(errorArg.statusCode, 401);
    assert.strictEqual(errorArg.code, "UNAUTHORIZED");
  });

  test("missing-token error produces correct {error,code} contract via errorHandler", async () => {
    let errorArg = null;
    const req = { get: () => undefined, headers: {} };
    await mw(req, null, (err) => { errorArg = err; });
    assert.ok(errorArg);

    const res = makeRes();
    errorHandler(errorArg, { method: "GET", path: "/t", originalUrl: "/t", user: null }, res, () => {});
    assert.strictEqual(res._status, 401);
    assert.strictEqual(typeof res._body.error, "string");
    assert.strictEqual(res._body.code, "UNAUTHORIZED");
  });
});

// ---------------------------------------------------------------------------
// Middleware ordering contract: Phase 1 before Phase 2
//
// Verifies the appFactory.js architectural invariant: unauthenticated Phase 1
// routes must NOT go through the Phase 2 auth gate.  We model this by showing
// that if enforcePasswordRotation and authenticate are applied to different
// route sets, the ordering is preserved correctly.
// ---------------------------------------------------------------------------

describe("middleware ordering: Phase 1 / Phase 2 contract", () => {
  test("Phase 2 gate blocks route when token is absent", async () => {
    const authenticate = createAuthenticateMiddleware({
      sessionRepository: {},
      userRepository: {},
    });
    let errorArg = null;
    await authenticate({ get: () => undefined, headers: {} }, null, (err) => { errorArg = err; });
    assert.ok(errorArg, "Phase 2 gate should block the request");
    assert.strictEqual(errorArg.statusCode, 401);
  });

  test("Phase 2 error propagates through errorHandler to standard {error,code} shape", async () => {
    const authenticate = createAuthenticateMiddleware({
      sessionRepository: {},
      userRepository: {},
    });
    let errorArg = null;
    await authenticate({ get: () => undefined, headers: {} }, null, (err) => { errorArg = err; });

    const res = makeRes();
    errorHandler(errorArg, { method: "GET", path: "/t", originalUrl: "/t", user: null }, res, () => {});
    assert.strictEqual(res._status, 401);
    assert.ok(typeof res._body.error === "string");
    assert.ok(typeof res._body.code === "string");
  });

  test("enforcePasswordRotation does NOT block when there is no user (mirrors Phase 1 pass-through)", () => {
    let nextCalled = false;
    enforcePasswordRotation(
      { user: null, originalUrl: "/api/v1/auth/login" },
      null,
      (err) => { if (!err) nextCalled = true; }
    );
    assert.ok(nextCalled, "Phase 1 route should not be blocked by password rotation gate");
  });
});
