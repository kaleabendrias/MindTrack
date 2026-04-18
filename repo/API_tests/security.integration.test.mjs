import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { BASE, ADMIN_PASS, CLINICIAN_PASS, CLIENT_PASS, login, trustedHeaders } from "./helpers.mjs";

// ---------------------------------------------------------------------------
// Request signing enforcement and role-access boundaries
// ---------------------------------------------------------------------------

test("trusted mutating request enforcement blocks missing csrf/nonce", async () => {
  const clinician = await login("clinician", CLINICIAN_PASS);
  const response = await fetch(`${BASE}/api/v1/mindtrack/entries`, {
    method: "POST",
    headers: { cookie: clinician.cookie, "content-type": "application/json" },
    body: JSON.stringify({ clientId: "cli001", entryType: "assessment", title: "Missing trusted headers", body: "Should fail" })
  });
  assert.equal(response.status, 401);
  const body = await response.json();
  assert.ok(typeof body.error === "string", "error response must include a string error message");
  assert.ok(typeof body.code === "string", "error response must include a string error code");
  assert.equal(body.data, undefined, "error response must not include a data field");
});

test("bad hmac signature is rejected on protected route", async () => {
  const clinician = await login("clinician", CLINICIAN_PASS);
  const response = await fetch(`${BASE}/api/v1/mindtrack/clients`, {
    headers: {
      cookie: clinician.cookie,
      "content-type": "application/json",
      "x-signature-timestamp": String(Date.now()),
      "x-signature-nonce": crypto.randomUUID(),
      "x-signature": "deadbeef"
    }
  });
  assert.equal(response.status, 401);
  const body = await response.json();
  assert.ok(typeof body.error === "string", "invalid-signature response must include an error string");
  assert.ok(typeof body.code === "string", "invalid-signature response must include an error code");
  assert.equal(body.data, undefined, "error response must not leak data");
});

test("unauthorized role access returns 403 and signed session rate limiting returns 429", async () => {
  const clinician = await login("clinician", CLINICIAN_PASS);

  const forbidden = await fetch(`${BASE}/api/v1/system/backup-status`, {
    headers: trustedHeaders(clinician, "/api/v1/system/backup-status")
  });
  assert.equal(forbidden.status, 403);
  const forbiddenBody = await forbidden.json();
  assert.ok(typeof forbiddenBody.error === "string", "403 response must include an error string");
  assert.ok(typeof forbiddenBody.code === "string", "403 response must include an error code");
  assert.equal(forbiddenBody.data, undefined, "403 response must not include data");

  let saw429 = false;
  for (let index = 0; index < 65; index += 1) {
    const res = await fetch(`${BASE}/api/v1/mindtrack/clients`, {
      headers: trustedHeaders(clinician, "/api/v1/mindtrack/clients")
    });
    if (res.status === 429) { saw429 = true; break; }
  }
  assert.equal(saw429, true);
});

test("requestSigningMiddleware rejects non-consecutive nonce replays", async () => {
  const clinician = await login("clinician", CLINICIAN_PASS);
  const path = "/api/v1/mindtrack/clients";

  function customHeaders(nonce) {
    const timestamp = Date.now();
    const payload = ["GET", path, String(timestamp), nonce, ""].join("|");
    const signature = crypto.createHmac("sha256", clinician.csrfToken).update(payload).digest("hex");
    return {
      cookie: clinician.cookie,
      "content-type": "application/json",
      "x-signature-timestamp": String(timestamp),
      "x-signature-nonce": nonce,
      "x-signature": signature
    };
  }

  const nonceA = crypto.randomUUID();
  const nonceB = crypto.randomUUID();
  const nonceC = crypto.randomUUID();

  assert.equal((await fetch(`${BASE}${path}`, { headers: customHeaders(nonceA) })).status, 200, "fresh nonceA must be accepted");
  assert.equal((await fetch(`${BASE}${path}`, { headers: customHeaders(nonceB) })).status, 200, "fresh nonceB must be accepted");
  assert.equal((await fetch(`${BASE}${path}`, { headers: customHeaders(nonceC) })).status, 200, "fresh nonceC must be accepted");

  const replayRes = await fetch(`${BASE}${path}`, { headers: customHeaders(nonceA) });
  assert.equal(replayRes.status, 401, "replayed non-consecutive nonceA must be rejected with 401");
  assert.equal((await replayRes.json()).code, "REPLAY_DETECTED");

  const replayBRes = await fetch(`${BASE}${path}`, { headers: customHeaders(nonceB) });
  assert.equal(replayBRes.status, 401);
  assert.equal((await replayBRes.json()).code, "REPLAY_DETECTED");
});

test("/auth/session requires the full signed-header chain (no signed headers → 401)", async () => {
  const admin = await login("administrator", ADMIN_PASS);

  const bareRes = await fetch(`${BASE}/api/v1/auth/session`, { method: "GET", headers: { cookie: admin.cookie } });
  assert.equal(bareRes.status, 401, "GET /auth/session without signed headers must be rejected");

  const signedRes = await fetch(`${BASE}/api/v1/auth/session`, { method: "GET", headers: trustedHeaders(admin, "/api/v1/auth/session") });
  assert.equal(signedRes.status, 200, "signed /auth/session must succeed");
  assert.ok((await signedRes.json()).data?.user?.id, "session payload must include the user");
});

test("/auth/session is rejected when the HMAC signature is forged", async () => {
  const admin = await login("administrator", ADMIN_PASS);
  const res = await fetch(`${BASE}/api/v1/auth/session`, {
    method: "GET",
    headers: {
      cookie: admin.cookie,
      "x-signature-timestamp": String(Date.now()),
      "x-signature-nonce": crypto.randomUUID(),
      "x-signature": "deadbeef"
    }
  });
  assert.equal(res.status, 401, "forged signature must be rejected");
});

test("/auth/session falls under the session rate limiter", async () => {
  const admin = await login("administrator", ADMIN_PASS);
  let saw429 = false;
  for (let i = 0; i < 70; i += 1) {
    const res = await fetch(`${BASE}/api/v1/auth/session`, { headers: trustedHeaders(admin, "/api/v1/auth/session") });
    if (res.status === 429) { saw429 = true; break; }
  }
  assert.equal(saw429, true, "/auth/session must be subject to session rate limiting");
});

test("401/403/404 matrix across sensitive endpoint families", async () => {
  const admin = await login("administrator", ADMIN_PASS);
  const client = await login("client", CLIENT_PASS);

  const rows = [
    { label: "401 /system/backup-status without signed headers", method: "GET", url: "/api/v1/system/backup-status", headers: { cookie: admin.cookie }, expect: 401 },
    { label: "401 /mindtrack/clients without signed headers", method: "GET", url: "/api/v1/mindtrack/clients", headers: { cookie: admin.cookie }, expect: 401 },
    { label: "401 /auth/session without signed headers", method: "GET", url: "/api/v1/auth/session", headers: { cookie: admin.cookie }, expect: 401 },
    { label: "403 /system/backup-status as client", method: "GET", url: "/api/v1/system/backup-status", headers: trustedHeaders(client, "/api/v1/system/backup-status"), expect: 403 },
    { label: "403 /system/security-flags as client", method: "GET", url: "/api/v1/system/security-flags", headers: trustedHeaders(client, "/api/v1/system/security-flags"), expect: 403 },
    { label: "403 /system/backup-files as client", method: "GET", url: "/api/v1/system/backup-files", headers: trustedHeaders(client, "/api/v1/system/backup-files"), expect: 403 },
    { label: "403 /users as client", method: "GET", url: "/api/v1/users", headers: trustedHeaders(client, "/api/v1/users"), expect: 403 },
    { label: "404 /mindtrack/clients/<missing>/timeline", method: "GET", url: "/api/v1/mindtrack/clients/00000000000000000000000000000000/timeline", headers: trustedHeaders(admin, "/api/v1/mindtrack/clients/00000000000000000000000000000000/timeline"), expect: 404 },
    { label: "404 attachment for unknown entry", method: "GET", url: "/api/v1/mindtrack/entries/00000000000000000000000000000000/attachments/deadbeef", headers: trustedHeaders(admin, "/api/v1/mindtrack/entries/00000000000000000000000000000000/attachments/deadbeef"), expect: 404 }
  ];

  for (const row of rows) {
    const res = await fetch(`${BASE}${row.url}`, { method: row.method, headers: row.headers });
    assert.equal(res.status, row.expect, `${row.label}: expected ${row.expect}, got ${res.status}`);
  }
});

test("behavior-based abnormal access rules persist metadata for rapid lookups and repeated backup attempts", async () => {
  const clinician = await login("clinician", CLINICIAN_PASS);
  for (let index = 0; index < 8; index += 1) {
    await fetch(`${BASE}/api/v1/mindtrack/clients`, { headers: trustedHeaders(clinician, "/api/v1/mindtrack/clients") });
  }
  const clinicianFlagsRes = await fetch(`${BASE}/api/v1/system/my-security-flags`, { headers: trustedHeaders(clinician, "/api/v1/system/my-security-flags") });
  const clinicianFlags = await clinicianFlagsRes.json();
  assert.equal(clinicianFlagsRes.status, 200);
  assert.equal(clinicianFlags.data.some((flag) => flag.ruleCode === "RULE_RAPID_RECORD_LOOKUP"), true);

  const admin = await login("administrator", ADMIN_PASS);
  for (let index = 0; index < 3; index += 1) {
    const body = JSON.stringify({ reason: `backup attempt ${index}` });
    await fetch(`${BASE}/api/v1/system/backup-run`, { method: "POST", headers: trustedHeaders(admin, "/api/v1/system/backup-run", { method: "POST", body }), body });
  }
  const adminFlagsRes = await fetch(`${BASE}/api/v1/system/my-security-flags`, { headers: trustedHeaders(admin, "/api/v1/system/my-security-flags") });
  const adminFlags = await adminFlagsRes.json();
  assert.equal(adminFlagsRes.status, 200);
  assert.equal(adminFlags.data.some((flag) => flag.ruleCode === "RULE_REPEATED_BACKUP_EXECUTION"), true);
});

test("global admin /system/security-flags supports filtering by user, session, rule, timestamp", async () => {
  const clinician = await login("clinician", CLINICIAN_PASS);
  for (let index = 0; index < 9; index += 1) {
    await fetch(`${BASE}/api/v1/mindtrack/clients`, { headers: trustedHeaders(clinician, "/api/v1/mindtrack/clients") });
  }

  const admin = await login("administrator", ADMIN_PASS);

  const allRes = await fetch(`${BASE}/api/v1/system/security-flags`, { headers: trustedHeaders(admin, "/api/v1/system/security-flags") });
  assert.equal(allRes.status, 200, "admin must be able to read global security flags");
  const allJson = await allRes.json();
  assert.ok(Array.isArray(allJson.data), "data must be an array");
  assert.ok(allJson.filters, "response should echo the active filters");
  assert.ok(allJson.data.length >= 1, "expected at least one flag generated by clinician activity");

  const sample = allJson.data.find((flag) => flag.userId && flag.sessionId && flag.ruleCode);
  assert.ok(sample, "expected at least one fully-populated flag for filter assertions");

  const userFilterRes = await fetch(`${BASE}/api/v1/system/security-flags?userId=${encodeURIComponent(sample.userId)}`, { headers: trustedHeaders(admin, `/api/v1/system/security-flags?userId=${encodeURIComponent(sample.userId)}`) });
  assert.equal(userFilterRes.status, 200);
  for (const flag of (await userFilterRes.json()).data) {
    assert.equal(flag.userId, sample.userId);
  }

  const ruleFilterRes = await fetch(`${BASE}/api/v1/system/security-flags?ruleCode=${encodeURIComponent(sample.ruleCode)}`, { headers: trustedHeaders(admin, `/api/v1/system/security-flags?ruleCode=${encodeURIComponent(sample.ruleCode)}`) });
  assert.equal(ruleFilterRes.status, 200);
  for (const flag of (await ruleFilterRes.json()).data) {
    assert.equal(flag.ruleCode, sample.ruleCode);
  }

  const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const timeFilterRes = await fetch(`${BASE}/api/v1/system/security-flags?from=${encodeURIComponent(future)}`, { headers: trustedHeaders(admin, `/api/v1/system/security-flags?from=${encodeURIComponent(future)}`) });
  assert.equal(timeFilterRes.status, 200);
  assert.equal((await timeFilterRes.json()).data.length, 0, "future-only timestamp filter must yield no results");
});

test("global admin /system/security-flags is forbidden for non-admin roles", async () => {
  const clinician = await login("clinician", CLINICIAN_PASS);
  const res = await fetch(`${BASE}/api/v1/system/security-flags`, { headers: trustedHeaders(clinician, "/api/v1/system/security-flags") });
  assert.equal(res.status, 403, "clinician must not access the global security-flags admin view");
});

test("self-scoped /system/my-security-flags remains available to all authenticated users", async () => {
  const client = await login("client", CLIENT_PASS);
  const res = await fetch(`${BASE}/api/v1/system/my-security-flags`, { headers: trustedHeaders(client, "/api/v1/system/my-security-flags") });
  assert.equal(res.status, 200);
  assert.ok(Array.isArray((await res.json()).data));
});

test("POST /auth/third-party is rejected because external integrations are disabled offline", async () => {
  const res = await fetch(`${BASE}/api/v1/auth/third-party`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) });
  const json = await res.json();
  const isDisabledResponse = res.status !== 200 || json.data?.disabled === true || json.data?.enabled === false || json.error != null;
  assert.equal(isDisabledResponse, true, `third-party login must be disabled for offline operation, got status ${res.status}`);
});
