import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { BASE, ADMIN_PASS, CLINICIAN_PASS, CLIENT_PASS, login, trustedHeaders, cookiesFrom } from "./helpers.mjs";

// ---------------------------------------------------------------------------
// Authentication flows: login, refresh, logout, recovery, rotate-password
// ---------------------------------------------------------------------------

test("login response body schema has required fields", async () => {
  const res = await login("administrator", ADMIN_PASS);
  assert.equal(res.status, 200);
  assert.ok(res.json.data, "login response must have a data object");
  assert.equal(typeof res.json.data.user.username, "string", "data.user.username must be a string");
  assert.equal(typeof res.json.data.user.role, "string", "data.user.role must be a string");
  assert.equal(typeof res.json.data.csrfToken, "string", "data.csrfToken must be a string");
  assert.ok(res.json.data.csrfToken.length > 0, "csrfToken must not be empty");
  assert.equal(res.json.error, undefined, "success response must not have an error field");
  assert.equal(res.json.data.user.role, "administrator");
});

test("login response surfaces mustRotatePassword flag and full user schema", async () => {
  const res = await fetch(`${BASE}/api/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "administrator", password: ADMIN_PASS })
  });
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.ok(json.data, "login response must include a data object");
  assert.ok(json.data.user, "login data must include user object");
  assert.ok(typeof json.data.user.id === "string", "user must have a string id");
  assert.ok(typeof json.data.user.username === "string", "user must have a string username");
  assert.ok(typeof json.data.user.role === "string", "user must have a string role");
  assert.equal(typeof json.data.user.mustRotatePassword, "boolean", "mustRotatePassword must be boolean");
  assert.ok(typeof json.data.csrfToken === "string", "login response must include csrfToken string");
  assert.ok(json.data.csrfToken.length > 0, "csrfToken must be non-empty");
  assert.equal(json.error, undefined, "success response must not include an error field");
});

test("wrong credentials returns structured error body", async () => {
  const res = await fetch(`${BASE}/api/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "administrator", password: "wrongpassword1A!" })
  });
  const json = await res.json();
  assert.ok(res.status === 401 || res.status === 400, "wrong credentials must return 401 or 400");
  assert.equal(typeof json.error, "string", "error field must be a string");
  assert.equal(typeof json.code, "string", "code field must be a string");
  assert.equal(json.data, undefined, "error response must not include data field");
});

test("unauthenticated request returns structured error body", async () => {
  const res = await fetch(`${BASE}/api/v1/mindtrack/clients`);
  const json = await res.json();
  assert.equal(res.status, 401);
  assert.equal(typeof json.error, "string", "error field must be a string");
  assert.equal(typeof json.code, "string", "code field must be a string");
  assert.equal(json.data, undefined, "error response must not include data field");
});

test("unauthenticated /auth/security-questions always returns identical generic challenge — never user-specific data", async () => {
  const GENERIC_LABEL = "What is your account recovery question?";

  const realRes = await fetch(`${BASE}/api/v1/auth/security-questions?username=administrator`);
  assert.equal(realRes.status, 200);
  const realJson = await realRes.json();
  assert.ok(Array.isArray(realJson.data), "response must be an array");
  assert.equal(realJson.data.length, 1, "exactly one generic entry");
  assert.equal(realJson.data[0].question, GENERIC_LABEL, "real user must receive the generic label");

  const fakeRes = await fetch(`${BASE}/api/v1/auth/security-questions?username=zzz_no_such_user_zzz`);
  assert.equal(fakeRes.status, 200);
  const fakeJson = await fakeRes.json();
  assert.equal(fakeJson.data.length, 1);
  assert.equal(fakeJson.data[0].question, GENERIC_LABEL, "non-existent user must receive the same generic label");

  const emptyRes = await fetch(`${BASE}/api/v1/auth/security-questions?username=`);
  assert.equal(emptyRes.status, 200);
  const emptyJson = await emptyRes.json();
  assert.equal(emptyJson.data[0].question, GENERIC_LABEL, "empty username must receive the same generic label");

  assert.deepEqual(realJson.data, fakeJson.data, "real and fake username responses must be identical");
  assert.deepEqual(fakeJson.data, emptyJson.data, "fake and empty username responses must be identical");

  for (const dataset of [realJson.data, fakeJson.data, emptyJson.data]) {
    for (const entry of dataset) {
      assert.ok(typeof entry.question === "string", "each entry must have a question string");
      assert.equal(Object.keys(entry).length, 1, "entries must not expose answer hashes or any other field");
    }
  }
});

test("/auth/recover-password returns uniform success regardless of user/question/answer validity", async () => {
  const cases = [
    { label: "non-existent user", body: { username: "zzz_no_such_user_recovery", question: "anything", answer: "anything", newPassword: "FreshNewPass12345!" } },
    { label: "real user, wrong question", body: { username: "administrator", question: "this is definitely not the question", answer: "anything", newPassword: "FreshNewPass12345!" } },
    { label: "real user, wrong answer", body: { username: "administrator", question: "What is your primary facility code?", answer: "wrong-answer", newPassword: "FreshNewPass12345!" } }
  ];

  let firstShape = null;
  for (const tc of cases) {
    const res = await fetch(`${BASE}/api/v1/auth/recover-password`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(tc.body) });
    assert.equal(res.status, 200, `${tc.label}: expected 200, got ${res.status}`);
    const json = await res.json();
    assert.equal(json.data.success, true, `${tc.label}: success must be true`);
    assert.equal(json.data.reset, false, `${tc.label}: reset must be false for invalid recovery`);
    if (!firstShape) { firstShape = json; } else { assert.deepEqual(json, firstShape, `${tc.label}: differs from first response`); }
  }
});

test("/auth/recover-password rejects weak passwords with a non-leaky 400", async () => {
  const res = await fetch(`${BASE}/api/v1/auth/recover-password`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "administrator", question: "anything", answer: "anything", newPassword: "x" })
  });
  assert.equal(res.status, 400);
});

test("POST /auth/rotate-password happy path: changes password and confirms success schema", async () => {
  const admin = await login("administrator", ADMIN_PASS);
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const testUsername = `rotatetest_${suffix}`;
  const initialPassword = `InitPass${suffix.slice(0, 4)}2026!`;
  const rotatedPassword = `RotatedPass${suffix.slice(0, 4)}2026!`;

  const createBody = JSON.stringify({ username: testUsername, password: initialPassword, role: "clinician", securityQuestions: [{ question: "Rotate test station?", answer: "station-alpha" }], reason: "rotate-password happy path test" });
  const createRes = await fetch(`${BASE}/api/v1/users`, { method: "POST", headers: trustedHeaders(admin, "/api/v1/users", { method: "POST", body: createBody }), body: createBody });
  assert.equal(createRes.status, 201, "test user must be created");

  const testUser = await login(testUsername, initialPassword);
  assert.ok(testUser.csrfToken, "new user login must return csrfToken");

  const rotateBody = JSON.stringify({ currentPassword: initialPassword, newPassword: rotatedPassword });
  const rotateRes = await fetch(`${BASE}/api/v1/auth/rotate-password`, { method: "POST", headers: trustedHeaders(testUser, "/api/v1/auth/rotate-password", { method: "POST", body: rotateBody }), body: rotateBody });
  assert.equal(rotateRes.status, 200, "rotate-password must return 200 on success");
  const rotateJson = await rotateRes.json();
  assert.ok(rotateJson.data, "rotate-password response must include a data object");
  assert.equal(rotateJson.data.success, true, "rotate-password data.success must be true");
  assert.equal(rotateJson.error, undefined, "success response must not include an error field");
  assert.equal(rotateJson.code, undefined, "success response must not include an error code");

  const reloginRes = await fetch(`${BASE}/api/v1/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: testUsername, password: rotatedPassword }) });
  assert.equal(reloginRes.status, 200, "login with new password must succeed after rotation");
  assert.ok((await reloginRes.json()).data?.csrfToken, "re-login must return a csrfToken");

  const oldPassRes = await fetch(`${BASE}/api/v1/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: testUsername, password: initialPassword }) });
  assert.notEqual(oldPassRes.status, 200, "old password must be rejected after rotation");
});

test("/auth/rotate-password validator rejects unknown body keys and missing fields", async () => {
  const admin = await login("administrator", ADMIN_PASS);
  const cases = [
    { label: "empty body", body: {} },
    { label: "missing newPassword", body: { currentPassword: "x" } },
    { label: "missing currentPassword", body: { newPassword: "y" } },
    { label: "extra root key", body: { currentPassword: "x", newPassword: "y", smuggle: 1 } },
    { label: "non-string fields", body: { currentPassword: 1, newPassword: 2 } }
  ];
  for (const tc of cases) {
    const body = JSON.stringify(tc.body);
    const res = await fetch(`${BASE}/api/v1/auth/rotate-password`, { method: "POST", headers: trustedHeaders(admin, "/api/v1/auth/rotate-password", { method: "POST", body }), body });
    assert.equal(res.status, 400, `${tc.label}: expected 400, got ${res.status}`);
  }
});

test("POST /auth/refresh issues a new access token using the refresh-token cookie", async () => {
  const loginRes = await fetch(`${BASE}/api/v1/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "administrator", password: ADMIN_PASS }) });
  assert.equal(loginRes.status, 200, "login must succeed before refresh test");
  const loginCookie = cookiesFrom(loginRes);

  const refreshRes = await fetch(`${BASE}/api/v1/auth/refresh`, { method: "POST", headers: { "content-type": "application/json", cookie: loginCookie }, body: JSON.stringify({}) });
  assert.equal(refreshRes.status, 200, "refresh must succeed with a valid refresh-token cookie");
  const refreshJson = await refreshRes.json();
  assert.ok(refreshJson.data?.csrfToken, "refresh response must include a new csrfToken");
  assert.equal(typeof refreshJson.data.csrfToken, "string");
  assert.ok(refreshJson.data.csrfToken.length > 0, "csrfToken must be non-empty");
});

test("POST /auth/logout clears the authenticated session", async () => {
  const admin = await login("administrator", ADMIN_PASS);

  const sessionBefore = await fetch(`${BASE}/api/v1/auth/session`, { headers: trustedHeaders(admin, "/api/v1/auth/session") });
  assert.equal(sessionBefore.status, 200, "session must be active before logout");

  const logoutBody = "{}";
  const logoutRes = await fetch(`${BASE}/api/v1/auth/logout`, { method: "POST", headers: trustedHeaders(admin, "/api/v1/auth/logout", { method: "POST", body: logoutBody }), body: logoutBody });
  assert.equal(logoutRes.status, 200, "logout must return 200");

  const sessionAfter = await fetch(`${BASE}/api/v1/auth/session`, {
    headers: { cookie: admin.cookie, "content-type": "application/json", "x-signature-timestamp": String(Date.now()), "x-signature-nonce": crypto.randomUUID(), "x-signature": "post-logout-probe" }
  });
  assert.equal(sessionAfter.status, 401, "old session cookie must be rejected after logout");
});
