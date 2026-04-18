import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { errorHandler } from "../../apps/backend/src/interfaces/http/middleware/errorHandler.js";

const makeReq = (overrides = {}) => ({
  method: "GET",
  path: "/test",
  originalUrl: "/test",
  user: null,
  ...overrides,
});

const makeRes = () => {
  const res = {};
  res.status = (code) => { res._status = code; return res; };
  res.json  = (body) => { res._body  = body; return res; };
  return res;
};

// ---------------------------------------------------------------------------
// Error-contract shape: every response must carry { error: string, code: string }
// ---------------------------------------------------------------------------

describe("errorHandler: known statusCode path", () => {
  test("returns the correct HTTP status and error/code fields", () => {
    const res = makeRes();
    errorHandler({ statusCode: 422, code: "VALIDATION_ERROR", message: "bad input" }, makeReq(), res, () => {});
    assert.strictEqual(res._status, 422);
    assert.strictEqual(res._body.error, "bad input");
    assert.strictEqual(res._body.code, "VALIDATION_ERROR");
  });

  test("code defaults to APPLICATION_ERROR when not set", () => {
    const res = makeRes();
    errorHandler({ statusCode: 404, message: "not found" }, makeReq(), res, () => {});
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._body.code, "APPLICATION_ERROR");
  });

  test("details field is included when present", () => {
    const res = makeRes();
    errorHandler(
      { statusCode: 400, code: "BAD_REQUEST", message: "invalid", details: ["field required"] },
      makeReq(), res, () => {}
    );
    assert.deepStrictEqual(res._body.details, ["field required"]);
  });

  test("details field is undefined when not provided", () => {
    const res = makeRes();
    errorHandler({ statusCode: 400, code: "BAD_REQUEST", message: "bad" }, makeReq(), res, () => {});
    assert.strictEqual(res._body.details, undefined);
  });

  test("401 UNAUTHORIZED produces correct contract", () => {
    const res = makeRes();
    errorHandler({ statusCode: 401, code: "UNAUTHORIZED", message: "not authenticated" }, makeReq(), res, () => {});
    assert.strictEqual(res._status, 401);
    assert.strictEqual(res._body.error, "not authenticated");
    assert.strictEqual(res._body.code, "UNAUTHORIZED");
  });

  test("403 FORBIDDEN produces correct contract", () => {
    const res = makeRes();
    errorHandler({ statusCode: 403, code: "FORBIDDEN", message: "insufficient permissions" }, makeReq(), res, () => {});
    assert.strictEqual(res._status, 403);
    assert.strictEqual(res._body.code, "FORBIDDEN");
  });

  test("401 SIGNATURE_REQUIRED produces correct contract", () => {
    const res = makeRes();
    errorHandler({ statusCode: 401, code: "SIGNATURE_REQUIRED", message: "missing request signature headers" }, makeReq(), res, () => {});
    assert.strictEqual(res._status, 401);
    assert.strictEqual(res._body.code, "SIGNATURE_REQUIRED");
  });

  test("401 REPLAY_DETECTED produces correct contract", () => {
    const res = makeRes();
    errorHandler({ statusCode: 401, code: "REPLAY_DETECTED", message: "replayed request detected" }, makeReq(), res, () => {});
    assert.strictEqual(res._status, 401);
    assert.strictEqual(res._body.code, "REPLAY_DETECTED");
  });

  test("403 PASSWORD_ROTATION_REQUIRED produces correct contract", () => {
    const res = makeRes();
    errorHandler(
      { statusCode: 403, code: "PASSWORD_ROTATION_REQUIRED", message: "password rotation required before continuing" },
      makeReq(), res, () => {}
    );
    assert.strictEqual(res._status, 403);
    assert.strictEqual(res._body.code, "PASSWORD_ROTATION_REQUIRED");
  });
});

describe("errorHandler: unexpected error path (no statusCode)", () => {
  test("plain Error falls back to 500 INTERNAL_ERROR", () => {
    const res = makeRes();
    errorHandler(new Error("explosion"), makeReq(), res, () => {});
    assert.strictEqual(res._status, 500);
    assert.strictEqual(res._body.error, "internal server error");
    assert.strictEqual(res._body.code, "INTERNAL_ERROR");
  });

  test("null error falls back to 500 INTERNAL_ERROR", () => {
    const res = makeRes();
    errorHandler(null, makeReq(), res, () => {});
    assert.strictEqual(res._status, 500);
    assert.strictEqual(res._body.code, "INTERNAL_ERROR");
  });

  test("undefined error falls back to 500 INTERNAL_ERROR", () => {
    const res = makeRes();
    errorHandler(undefined, makeReq(), res, () => {});
    assert.strictEqual(res._status, 500);
    assert.strictEqual(res._body.code, "INTERNAL_ERROR");
  });

  test("unexpected 500 writes to console.error with type unexpected_500", () => {
    const logs = [];
    const orig = console.error;
    console.error = (msg) => logs.push(msg);
    const res = makeRes();
    errorHandler(new Error("surprise"), makeReq(), res, () => {});
    console.error = orig;
    assert.ok(logs.length > 0, "console.error should have been called");
    const parsed = JSON.parse(logs[0]);
    assert.strictEqual(parsed.type, "unexpected_500");
  });
});

describe("errorHandler: 5xx logging behaviour", () => {
  test("status >= 500 writes to console.error with type unhandled_application_error", () => {
    const logs = [];
    const orig = console.error;
    console.error = (msg) => logs.push(msg);
    const res = makeRes();
    errorHandler({ statusCode: 503, code: "DOWN", message: "overloaded" }, makeReq(), res, () => {});
    console.error = orig;
    assert.ok(logs.length > 0);
    const parsed = JSON.parse(logs[0]);
    assert.strictEqual(parsed.type, "unhandled_application_error");
    assert.strictEqual(parsed.statusCode, 503);
  });

  test("userId from req.user is included in 5xx log", () => {
    const logs = [];
    const orig = console.error;
    console.error = (msg) => logs.push(msg);
    const res = makeRes();
    errorHandler(
      { statusCode: 500, code: "BOOM", message: "crashed" },
      makeReq({ user: { id: "user-abc" } }),
      res,
      () => {}
    );
    console.error = orig;
    const parsed = JSON.parse(logs[0]);
    assert.strictEqual(parsed.userId, "user-abc");
  });

  test("4xx errors do NOT trigger console.error", () => {
    const logs = [];
    const orig = console.error;
    console.error = (msg) => logs.push(msg);
    const res = makeRes();
    errorHandler({ statusCode: 422, code: "VALIDATION", message: "bad" }, makeReq(), res, () => {});
    console.error = orig;
    assert.strictEqual(logs.length, 0);
  });

  test("log entry includes method and path from request", () => {
    const logs = [];
    const orig = console.error;
    console.error = (msg) => logs.push(msg);
    const res = makeRes();
    errorHandler(
      { statusCode: 500, code: "ERR", message: "err" },
      makeReq({ method: "POST", originalUrl: "/api/v1/mindtrack/entries" }),
      res,
      () => {}
    );
    console.error = orig;
    const parsed = JSON.parse(logs[0]);
    assert.strictEqual(parsed.method, "POST");
    assert.strictEqual(parsed.path, "/api/v1/mindtrack/entries");
  });
});
