/**
 * Isolated unit tests for HTTP controllers.
 *
 * Each controller is instantiated with stub services so tests exercise only the
 * HTTP-layer contract: correct status codes, response body shape, cookie
 * operations, and delegation to the right service method with the right
 * arguments.  No real database or infrastructure is touched.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { AuthController } from "../../apps/backend/src/interfaces/http/controllers/AuthController.js";
import { UserController } from "../../apps/backend/src/interfaces/http/controllers/UserController.js";
import { MindTrackController } from "../../apps/backend/src/interfaces/http/controllers/MindTrackController.js";
import { SystemController } from "../../apps/backend/src/interfaces/http/controllers/SystemController.js";

// ---------------------------------------------------------------------------
// Request / response test doubles
// ---------------------------------------------------------------------------

const makeReq = (overrides = {}) => ({
  body: {},
  params: {},
  query: {},
  user: {
    id: "u-admin",
    role: "administrator",
    permissions: [],
    sessionId: "sess-1"
  },
  ip: "127.0.0.1",
  get: (_h) => undefined,
  headers: {},
  ...overrides,
});

const makeRes = () => {
  const r = { _status: null, _body: null, _cookies: {}, _headers: {} };
  r.status    = (code) => { r._status = code; return r; };
  r.json      = (body) => { r._body  = body; return r; };
  r.send      = (body) => { r._body  = body; return r; };
  r.setHeader = (k, v) => { r._headers[k] = v; return r; };
  r.cookie    = (name, val) => { r._cookies[name] = val; return r; };
  r.clearCookie = (name) => { r._cookies[name] = null; return r; };
  return r;
};

// ---------------------------------------------------------------------------
// AuthService stub factory
// ---------------------------------------------------------------------------

const makeAuthService = (overrides = {}) => ({
  login: async () => ({
    user: { id: "u1", role: "administrator", mustRotatePassword: false },
    accessToken: "at",
    refreshToken: "rt",
    csrfToken: "csrf-tok",
    expiresInSeconds: 1800,
    refreshExpiresInSeconds: 604800,
  }),
  refreshTokens: async () => ({
    accessToken: "at2",
    refreshToken: "rt2",
    csrfToken: "csrf-tok2",
    expiresInSeconds: 1800,
    refreshExpiresInSeconds: 604800,
  }),
  getSessionContext: async () => ({
    user: { id: "u1", role: "administrator" },
    csrfToken: "csrf-tok",
  }),
  logout: async () => {},
  getSecurityQuestions: async () => [{ question: "What is your pet name?" }],
  recoverPasswordWithQuestion: async () => ({ reset: true }),
  rotatePassword: async () => ({ success: true }),
  registerByAdmin: async () => ({ id: "new-u", username: "created" }),
  adminResetPassword: async () => {},
  sanitizeUser: (user, _canViewPii) => ({ id: user.id, username: user.username }),
  ...overrides,
});

const makeThirdPartyService = (overrides = {}) => ({
  authenticate: async () => {},
  ...overrides,
});

// ---------------------------------------------------------------------------
// AuthController
// ---------------------------------------------------------------------------

describe("AuthController.login", () => {
  test("responds 200 with user + csrfToken + expiry shape", async () => {
    const ctrl = new AuthController(makeAuthService(), makeThirdPartyService());
    const res = makeRes();
    await ctrl.login(makeReq({ body: { username: "admin", password: "pw" } }), res);
    assert.strictEqual(res._status, 200);
    assert.ok(res._body.data, "data field must exist");
    assert.ok(res._body.data.user, "data.user must exist");
    assert.ok("csrfToken" in res._body.data, "csrfToken must be in response");
    assert.ok(typeof res._body.data.expiresInSeconds === "number");
    assert.ok(typeof res._body.data.refreshExpiresInSeconds === "number");
  });

  test("delegates to authService.login with username, password, ip, and userAgent", async () => {
    let captured = null;
    const svc = makeAuthService({
      login: async (args) => {
        captured = args;
        return { user: {}, accessToken: "a", refreshToken: "r", csrfToken: "c", expiresInSeconds: 1, refreshExpiresInSeconds: 1 };
      },
    });
    const ctrl = new AuthController(svc, makeThirdPartyService());
    await ctrl.login(
      makeReq({
        body: { username: "alice", password: "secret" },
        ip: "10.0.0.2",
        get: (h) => (h === "user-agent" ? "TestBrowser/1" : undefined),
      }),
      makeRes()
    );
    assert.strictEqual(captured.username, "alice");
    assert.strictEqual(captured.password, "secret");
    assert.strictEqual(captured.ipAddress, "10.0.0.2");
    assert.strictEqual(captured.userAgent, "TestBrowser/1");
  });

  test("sets both session cookies on the response", async () => {
    const ctrl = new AuthController(makeAuthService(), makeThirdPartyService());
    const res = makeRes();
    await ctrl.login(makeReq({ body: { username: "a", password: "b" } }), res);
    assert.ok("mindtrack_access_token" in res._cookies, "access token cookie must be set");
    assert.ok("mindtrack_refresh_token" in res._cookies, "refresh token cookie must be set");
  });
});

describe("AuthController.refresh", () => {
  test("responds 200 with csrfToken and expiry shape (no user field)", async () => {
    const ctrl = new AuthController(makeAuthService(), makeThirdPartyService());
    const res = makeRes();
    await ctrl.refresh(makeReq({ body: { refreshToken: "old-rt" } }), res);
    assert.strictEqual(res._status, 200);
    assert.ok("csrfToken" in res._body.data);
    assert.ok(typeof res._body.data.expiresInSeconds === "number");
    assert.ok(!("user" in (res._body.data || {})), "refresh response must not include user");
  });

  test("delegates refreshToken from request body to authService.refreshTokens", async () => {
    let capturedToken = null;
    const svc = makeAuthService({
      refreshTokens: async (token) => {
        capturedToken = token;
        return { accessToken: "a", refreshToken: "r", csrfToken: "c", expiresInSeconds: 1, refreshExpiresInSeconds: 1 };
      },
    });
    const ctrl = new AuthController(svc, makeThirdPartyService());
    await ctrl.refresh(makeReq({ body: { refreshToken: "the-refresh-token" } }), makeRes());
    assert.strictEqual(capturedToken, "the-refresh-token");
  });

  test("sets new session cookies", async () => {
    const ctrl = new AuthController(makeAuthService(), makeThirdPartyService());
    const res = makeRes();
    await ctrl.refresh(makeReq({ body: { refreshToken: "rt" } }), res);
    assert.ok("mindtrack_access_token" in res._cookies);
    assert.ok("mindtrack_refresh_token" in res._cookies);
  });
});

describe("AuthController.session", () => {
  test("responds 200 with data from authService.getSessionContext", async () => {
    const ctrl = new AuthController(makeAuthService(), makeThirdPartyService());
    const res = makeRes();
    await ctrl.session(makeReq(), res);
    assert.strictEqual(res._status, 200);
    assert.ok(res._body.data);
  });

  test("passes sessionId from req.user to authService.getSessionContext", async () => {
    let capturedSid = null;
    const svc = makeAuthService({
      getSessionContext: async (sid) => { capturedSid = sid; return {}; },
    });
    const ctrl = new AuthController(svc, makeThirdPartyService());
    await ctrl.session(makeReq({ user: { sessionId: "session-xyz", permissions: [] } }), makeRes());
    assert.strictEqual(capturedSid, "session-xyz");
  });
});

describe("AuthController.logout", () => {
  test("responds 200 with {data: {success: true}}", async () => {
    const ctrl = new AuthController(makeAuthService(), makeThirdPartyService());
    const res = makeRes();
    await ctrl.logout(makeReq(), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._body.data.success, true);
  });

  test("delegates req.user.sessionId to authService.logout", async () => {
    let capturedSid = null;
    const svc = makeAuthService({
      logout: async (sid) => { capturedSid = sid; },
    });
    const ctrl = new AuthController(svc, makeThirdPartyService());
    await ctrl.logout(makeReq({ user: { sessionId: "sess-42", permissions: [] } }), makeRes());
    assert.strictEqual(capturedSid, "sess-42");
  });

  test("clears both session cookies", async () => {
    const ctrl = new AuthController(makeAuthService(), makeThirdPartyService());
    const res = makeRes();
    await ctrl.logout(makeReq(), res);
    assert.strictEqual(res._cookies["mindtrack_access_token"], null, "access cookie must be cleared");
    assert.strictEqual(res._cookies["mindtrack_refresh_token"], null, "refresh cookie must be cleared");
  });
});

describe("AuthController.securityQuestions", () => {
  test("responds 200 with data array from authService", async () => {
    const ctrl = new AuthController(makeAuthService(), makeThirdPartyService());
    const res = makeRes();
    await ctrl.securityQuestions(makeReq({ query: { username: "alice" } }), res);
    assert.strictEqual(res._status, 200);
    assert.ok(Array.isArray(res._body.data));
  });

  test("passes username query param to authService.getSecurityQuestions", async () => {
    let capturedUsername = null;
    const svc = makeAuthService({
      getSecurityQuestions: async (u) => { capturedUsername = u; return []; },
    });
    const ctrl = new AuthController(svc, makeThirdPartyService());
    await ctrl.securityQuestions(makeReq({ query: { username: "bob" } }), makeRes());
    assert.strictEqual(capturedUsername, "bob");
  });
});

describe("AuthController.recoverPassword", () => {
  test("responds 200 with data from authService.recoverPasswordWithQuestion", async () => {
    const ctrl = new AuthController(makeAuthService(), makeThirdPartyService());
    const res = makeRes();
    await ctrl.recoverPassword(
      makeReq({ body: { username: "u", question: "Q?", answer: "A", newPassword: "NewPass123!" } }),
      res
    );
    assert.strictEqual(res._status, 200);
    assert.ok("reset" in res._body.data);
  });

  test("delegates req.body to authService.recoverPasswordWithQuestion", async () => {
    let capturedBody = null;
    const svc = makeAuthService({
      recoverPasswordWithQuestion: async (body) => { capturedBody = body; return { reset: true }; },
    });
    const ctrl = new AuthController(svc, makeThirdPartyService());
    const payload = { username: "carol", question: "Q?", answer: "ans", newPassword: "ValidPw1234!" };
    await ctrl.recoverPassword(makeReq({ body: payload }), makeRes());
    assert.deepStrictEqual(capturedBody, payload);
  });
});

describe("AuthController.rotatePassword", () => {
  test("responds 200 with {data} from authService.rotatePassword", async () => {
    const ctrl = new AuthController(makeAuthService(), makeThirdPartyService());
    const res = makeRes();
    await ctrl.rotatePassword(
      makeReq({ body: { currentPassword: "OldPass1", newPassword: "NewPass1234!" } }),
      res
    );
    assert.strictEqual(res._status, 200);
    assert.ok(res._body.data);
  });

  test("passes actor, currentPassword, and newPassword to authService.rotatePassword", async () => {
    let capturedArgs = null;
    const svc = makeAuthService({
      rotatePassword: async (args) => { capturedArgs = args; return { success: true }; },
    });
    const ctrl = new AuthController(svc, makeThirdPartyService());
    const user = { id: "u-me", role: "clinician", permissions: [], sessionId: "s1" };
    await ctrl.rotatePassword(
      makeReq({ user, body: { currentPassword: "Old1", newPassword: "New123456!" } }),
      makeRes()
    );
    assert.deepStrictEqual(capturedArgs.actor, user);
    assert.strictEqual(capturedArgs.currentPassword, "Old1");
    assert.strictEqual(capturedArgs.newPassword, "New123456!");
  });
});

describe("AuthController.thirdPartyLogin", () => {
  test("delegates to thirdPartyLoginService.authenticate", async () => {
    let called = false;
    const tpSvc = makeThirdPartyService({
      authenticate: async () => { called = true; },
    });
    const ctrl = new AuthController(makeAuthService(), tpSvc);
    await ctrl.thirdPartyLogin(makeReq(), makeRes());
    assert.ok(called, "thirdPartyLoginService.authenticate must be called");
  });
});

// ---------------------------------------------------------------------------
// UserController
// ---------------------------------------------------------------------------

describe("UserController.list", () => {
  test("responds 200 with a data array", async () => {
    const userRepo = {
      list: async () => [
        { id: "u1", username: "alice" },
        { id: "u2", username: "bob" },
      ],
    };
    const ctrl = new UserController(makeAuthService(), userRepo);
    const res = makeRes();
    await ctrl.list(makeReq(), res);
    assert.strictEqual(res._status, 200);
    assert.ok(Array.isArray(res._body.data));
    assert.strictEqual(res._body.data.length, 2);
  });

  test("calls sanitizeUser for every user returned by repository", async () => {
    const sanitized = [];
    const svc = makeAuthService({
      sanitizeUser: (user, _pii) => { sanitized.push(user.id); return { id: user.id }; },
    });
    const userRepo = {
      list: async () => [{ id: "u-a" }, { id: "u-b" }, { id: "u-c" }],
    };
    const ctrl = new UserController(svc, userRepo);
    await ctrl.list(makeReq(), makeRes());
    assert.deepStrictEqual(sanitized.sort(), ["u-a", "u-b", "u-c"]);
  });

  test("canViewPii is false when user lacks PII_VIEW permission", async () => {
    let capturedPii = null;
    const svc = makeAuthService({
      sanitizeUser: (_user, pii) => { capturedPii = pii; return {}; },
    });
    const userRepo = { list: async () => [{ id: "x" }] };
    const ctrl = new UserController(svc, userRepo);
    await ctrl.list(makeReq({ user: { permissions: [], sessionId: "s" } }), makeRes());
    assert.strictEqual(capturedPii, false);
  });
});

describe("UserController.create", () => {
  test("responds 201 with created user data", async () => {
    const ctrl = new UserController(makeAuthService(), { list: async () => [] });
    const res = makeRes();
    await ctrl.create(
      makeReq({ body: { username: "newuser", password: "Pw123456789!", role: "clinician" } }),
      res
    );
    assert.strictEqual(res._status, 201);
    assert.ok(res._body.data);
    assert.ok(res._body.data.id);
  });

  test("delegates actor and body fields to authService.registerByAdmin", async () => {
    let capturedArgs = null;
    const svc = makeAuthService({
      registerByAdmin: async (args) => { capturedArgs = args; return { id: "new" }; },
    });
    const ctrl = new UserController(svc, { list: async () => [] });
    const user = { id: "admin-1", role: "administrator", permissions: [], sessionId: "s" };
    await ctrl.create(
      makeReq({ user, body: { username: "nu", password: "Pw1234567890!" } }),
      makeRes()
    );
    assert.strictEqual(capturedArgs.actor, user);
    assert.strictEqual(capturedArgs.username, "nu");
  });
});

describe("UserController.adminResetPassword", () => {
  test("responds 200 with {data: {success: true}}", async () => {
    const ctrl = new UserController(makeAuthService(), { list: async () => [] });
    const res = makeRes();
    await ctrl.adminResetPassword(
      makeReq({ params: { id: "target-u" }, body: { newPassword: "NewPw123456!", reason: "admin reset" } }),
      res
    );
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._body.data.success, true);
  });

  test("passes targetUserId, newPassword, reason, and actor to authService.adminResetPassword", async () => {
    let capturedArgs = null;
    const svc = makeAuthService({
      adminResetPassword: async (args) => { capturedArgs = args; },
    });
    const ctrl = new UserController(svc, { list: async () => [] });
    const actor = { id: "admin-99", role: "administrator", permissions: [], sessionId: "s" };
    await ctrl.adminResetPassword(
      makeReq({
        user: actor,
        params: { id: "target-456" },
        body: { newPassword: "Pw1234567890!", reason: "security rotation" },
      }),
      makeRes()
    );
    assert.strictEqual(capturedArgs.actor, actor);
    assert.strictEqual(capturedArgs.targetUserId, "target-456");
    assert.strictEqual(capturedArgs.newPassword, "Pw1234567890!");
    assert.strictEqual(capturedArgs.reason, "security rotation");
  });
});

// ---------------------------------------------------------------------------
// MindTrackController
// ---------------------------------------------------------------------------

const makeMindTrackService = (overrides = {}) => ({
  listClients: async () => [{ id: "c1", name: "Patient A" }],
  createClient: async () => ({ id: "c-new" }),
  listTimeline: async () => [{ id: "e1", type: "assessment" }],
  createEntry: async () => ({ id: "e-new", version: 1 }),
  signEntry: async () => ({ statusCode: 200, body: { id: "e1", status: "signed" }, idempotentReplay: false }),
  amendEntry: async () => ({ statusCode: 200, body: { id: "e1", version: 2 }, idempotentReplay: false }),
  deleteEntry: async () => ({ statusCode: 200, body: { id: "e1", status: "deleted" }, idempotentReplay: false }),
  restoreEntry: async () => ({ statusCode: 200, body: { id: "e1", status: "draft" }, idempotentReplay: false }),
  searchEntries: async () => ({ results: [], total: 0 }),
  ...overrides,
});

describe("MindTrackController.listClients", () => {
  test("responds 200 with data array", async () => {
    const ctrl = new MindTrackController(makeMindTrackService());
    const res = makeRes();
    await ctrl.listClients(makeReq(), res);
    assert.strictEqual(res._status, 200);
    assert.ok(Array.isArray(res._body.data));
  });

  test("passes req.user to mindTrackService.listClients", async () => {
    let capturedUser = null;
    const svc = makeMindTrackService({
      listClients: async (user) => { capturedUser = user; return []; },
    });
    const ctrl = new MindTrackController(svc);
    const user = { id: "u-clin", role: "clinician", permissions: [], sessionId: "s" };
    await ctrl.listClients(makeReq({ user }), makeRes());
    assert.deepStrictEqual(capturedUser, user);
  });
});

describe("MindTrackController.createClient", () => {
  test("responds 201 with created client data", async () => {
    const ctrl = new MindTrackController(makeMindTrackService());
    const res = makeRes();
    await ctrl.createClient(makeReq({ body: { name: "New Patient" } }), res);
    assert.strictEqual(res._status, 201);
    assert.ok(res._body.data.id);
  });

  test("passes actor and payload to mindTrackService.createClient", async () => {
    let capturedArgs = null;
    const svc = makeMindTrackService({
      createClient: async (args) => { capturedArgs = args; return { id: "c" }; },
    });
    const ctrl = new MindTrackController(svc);
    const user = { id: "u-admin", role: "administrator", permissions: [], sessionId: "s" };
    const body = { name: "Alice", dob: "1990-01-01" };
    await ctrl.createClient(makeReq({ user, body }), makeRes());
    assert.strictEqual(capturedArgs.actor, user);
    assert.deepStrictEqual(capturedArgs.payload, body);
  });
});

describe("MindTrackController.timeline", () => {
  test("responds 200 with data array", async () => {
    const ctrl = new MindTrackController(makeMindTrackService());
    const res = makeRes();
    await ctrl.timeline(makeReq({ params: { clientId: "c-1" } }), res);
    assert.strictEqual(res._status, 200);
    assert.ok(Array.isArray(res._body.data));
  });

  test("passes clientId and actor to mindTrackService.listTimeline", async () => {
    let capturedArgs = null;
    const svc = makeMindTrackService({
      listTimeline: async (args) => { capturedArgs = args; return []; },
    });
    const ctrl = new MindTrackController(svc);
    await ctrl.timeline(makeReq({ params: { clientId: "c-xyz" } }), makeRes());
    assert.strictEqual(capturedArgs.clientId, "c-xyz");
    assert.ok(capturedArgs.actor, "actor must be passed");
  });
});

describe("MindTrackController.createEntry", () => {
  test("responds 201 with created entry including version", async () => {
    const ctrl = new MindTrackController(makeMindTrackService());
    const res = makeRes();
    await ctrl.createEntry(makeReq({ body: { clientId: "c1", type: "assessment" } }), res);
    assert.strictEqual(res._status, 201);
    assert.ok(res._body.data.id);
  });
});

describe("MindTrackController.signEntry", () => {
  test("uses statusCode from service response", async () => {
    const svc = makeMindTrackService({
      signEntry: async () => ({ statusCode: 200, body: { id: "e1" }, idempotentReplay: false }),
    });
    const ctrl = new MindTrackController(svc);
    const res = makeRes();
    await ctrl.signEntry(
      makeReq({
        params: { entryId: "e1" },
        body: { expectedVersion: 1 },
        get: (h) => (h === "x-idempotency-key" ? "idem-1" : undefined),
      }),
      res
    );
    assert.strictEqual(res._status, 200);
    assert.ok(res._body.data);
    assert.strictEqual(res._body.idempotentReplay, false);
  });

  test("forwards idempotentReplay:true on replay", async () => {
    const svc = makeMindTrackService({
      signEntry: async () => ({ statusCode: 200, body: { id: "e1" }, idempotentReplay: true }),
    });
    const ctrl = new MindTrackController(svc);
    const res = makeRes();
    await ctrl.signEntry(
      makeReq({ params: { entryId: "e1" }, body: { expectedVersion: 1 }, get: () => "idem-1" }),
      res
    );
    assert.strictEqual(res._body.idempotentReplay, true);
  });
});

describe("MindTrackController.amendEntry", () => {
  test("uses statusCode from service and returns idempotentReplay", async () => {
    const ctrl = new MindTrackController(makeMindTrackService());
    const res = makeRes();
    await ctrl.amendEntry(
      makeReq({
        params: { entryId: "e-99" },
        body: { expectedVersion: 2, body: "Updated text", reason: "correction" },
        get: () => "idem-amend-1",
      }),
      res
    );
    assert.strictEqual(res._status, 200);
    assert.ok("idempotentReplay" in res._body);
  });

  test("passes all required fields to mindTrackService.amendEntry", async () => {
    let capturedArgs = null;
    const svc = makeMindTrackService({
      amendEntry: async (args) => { capturedArgs = args; return { statusCode: 200, body: {}, idempotentReplay: false }; },
    });
    const ctrl = new MindTrackController(svc);
    await ctrl.amendEntry(
      makeReq({
        params: { entryId: "e-test" },
        body: { expectedVersion: 3, body: "Amendment text", reason: "clinical update" },
        get: (h) => (h === "x-idempotency-key" ? "idem-key-99" : undefined),
      }),
      makeRes()
    );
    assert.strictEqual(capturedArgs.entryId, "e-test");
    assert.strictEqual(capturedArgs.expectedVersion, 3);
    assert.strictEqual(capturedArgs.body, "Amendment text");
    assert.strictEqual(capturedArgs.reason, "clinical update");
    assert.strictEqual(capturedArgs.idempotencyKey, "idem-key-99");
  });
});

// ---------------------------------------------------------------------------
// SystemController
// ---------------------------------------------------------------------------

const makeSystemService = (overrides = {}) => ({
  getOfflinePolicy: () => ({ offline: true, externalNetworkEnabled: false }),
  getBackupStatus: async () => ({ lastBackup: null, schedule: "0 0 * * *", retentionDays: 30 }),
  getProfileFields: async () => ({ standard: [], custom: [] }),
  ...overrides,
});

describe("SystemController.offlinePolicy", () => {
  test("responds 200 with data from systemService.getOfflinePolicy", async () => {
    const ctrl = new SystemController(makeSystemService());
    const res = makeRes();
    await ctrl.offlinePolicy(makeReq(), res);
    assert.strictEqual(res._status, 200);
    assert.ok(res._body.data);
    assert.strictEqual(res._body.data.offline, true);
    assert.strictEqual(res._body.data.externalNetworkEnabled, false);
  });

  test("calls systemService.getOfflinePolicy synchronously", async () => {
    let called = false;
    const svc = makeSystemService({
      getOfflinePolicy: () => { called = true; return { offline: true }; },
    });
    const ctrl = new SystemController(svc);
    await ctrl.offlinePolicy(makeReq(), makeRes());
    assert.ok(called);
  });
});

describe("SystemController.backupStatus", () => {
  test("responds 200 with backup status data", async () => {
    const ctrl = new SystemController(makeSystemService());
    const res = makeRes();
    await ctrl.backupStatus(makeReq(), res);
    assert.strictEqual(res._status, 200);
    assert.ok(res._body.data);
    assert.ok("retentionDays" in res._body.data);
    assert.ok("schedule" in res._body.data);
  });

  test("calls systemService.getBackupStatus", async () => {
    let called = false;
    const svc = makeSystemService({
      getBackupStatus: async () => { called = true; return { retentionDays: 30 }; },
    });
    const ctrl = new SystemController(svc);
    await ctrl.backupStatus(makeReq(), makeRes());
    assert.ok(called);
  });
});

describe("SystemController.profileFields", () => {
  test("responds 200 with profile fields data", async () => {
    const ctrl = new SystemController(makeSystemService());
    const res = makeRes();
    await ctrl.profileFields(makeReq(), res);
    assert.strictEqual(res._status, 200);
    assert.ok(res._body.data);
    assert.ok("standard" in res._body.data);
    assert.ok("custom" in res._body.data);
  });
});
