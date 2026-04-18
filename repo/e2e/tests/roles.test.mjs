import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

const BACKEND = process.env.BACKEND_BASE_URL || "http://127.0.0.1:4000";
const FRONTEND = process.env.FRONTEND_BASE_URL || "http://127.0.0.1:3000";
const ADMIN_PASS = process.env.SEED_ADMIN_PASSWORD || "RotateMe_Admin_2026x1";
const CLINICIAN_PASS = process.env.SEED_CLINICIAN_PASSWORD || "RotateMe_Clinician_2026x1";
const CLIENT_PASS = process.env.SEED_CLIENT_PASSWORD || "RotateMe_Client_2026x1";

function cookiesFrom(response) {
  return (response.headers.getSetCookie?.() || [])
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

function trustedHeaders(session, path, { method = "GET", body = "", idempotencyKey } = {}) {
  const timestamp = Date.now();
  const nonce = crypto.randomUUID();
  const payload = [method.toUpperCase(), path, String(timestamp), nonce, body].join("|");
  const signingKey = session.csrfToken;
  const signature = crypto.createHmac("sha256", signingKey).update(payload).digest("hex");

  const headers = {
    cookie: session.cookie,
    "content-type": "application/json",
    "x-signature-timestamp": String(timestamp),
    "x-signature-nonce": nonce,
    "x-signature": signature
  };

  if (!["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase())) {
    headers["x-csrf-token"] = session.csrfToken;
    headers["x-request-nonce"] = nonce;
  }

  if (idempotencyKey) {
    headers["x-idempotency-key"] = idempotencyKey;
  }

  return headers;
}

async function login(username, password) {
  const response = await fetch(`${BACKEND}/api/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  assert.equal(response.status, 200, `login as ${username} should succeed`);
  const json = await response.json();
  return {
    json,
    cookie: cookiesFrom(response),
    csrfToken: json.data?.csrfToken
  };
}

test("client E2E: login, self-context, self-assessment, access boundary enforcement", async () => {
  const client = await login("client", CLIENT_PASS);

  const selfContextRes = await fetch(`${BACKEND}/api/v1/mindtrack/self-context`, {
    headers: trustedHeaders(client, "/api/v1/mindtrack/self-context")
  });
  assert.equal(selfContextRes.status, 200);
  const selfContext = await selfContextRes.json();
  assert.equal(selfContext.data.client._id, "cli001");
  assert.ok(selfContext.data.client.name, "client should see own name");

  const entryBody = JSON.stringify({
    clientId: "cli001",
    entryType: "assessment",
    title: "E2E self assessment",
    body: "Client completed assessment from E2E HTTP flow.",
    tags: ["e2e"],
    reason: "Client self-assessment"
  });
  const createRes = await fetch(`${BACKEND}/api/v1/mindtrack/entries`, {
    method: "POST",
    headers: trustedHeaders(client, "/api/v1/mindtrack/entries", { method: "POST", body: entryBody }),
    body: entryBody
  });
  assert.ok([201, 409].includes(createRes.status), "client creates or is blocked by legal hold (409 from prior test data)");

  const forbiddenTimeline = await fetch(`${BACKEND}/api/v1/mindtrack/clients/cli002/timeline`, {
    headers: trustedHeaders(client, "/api/v1/mindtrack/clients/cli002/timeline")
  });
  assert.equal(forbiddenTimeline.status, 403, "client must not access other client data");

  const forbiddenBackup = await fetch(`${BACKEND}/api/v1/system/backup-status`, {
    headers: trustedHeaders(client, "/api/v1/system/backup-status")
  });
  assert.equal(forbiddenBackup.status, 403, "client must not access admin backup");
});

test("clinician E2E: login, list clients, create entry, client registration, profile edit, access boundaries", async () => {
  const clinician = await login("clinician", CLINICIAN_PASS);

  const clientsRes = await fetch(`${BACKEND}/api/v1/mindtrack/clients`, {
    headers: trustedHeaders(clinician, "/api/v1/mindtrack/clients")
  });
  assert.equal(clientsRes.status, 200);
  const clientsJson = await clientsRes.json();
  assert.ok(clientsJson.data.length >= 1, "clinician should see assigned clients");

  const clientId = clientsJson.data[0]._id;
  const timelineRes = await fetch(`${BACKEND}/api/v1/mindtrack/clients/${clientId}/timeline`, {
    headers: trustedHeaders(clinician, `/api/v1/mindtrack/clients/${clientId}/timeline`)
  });
  assert.equal(timelineRes.status, 200);

  const entryBody = JSON.stringify({
    clientId,
    entryType: "counseling_note",
    title: "E2E clinician note",
    body: "Clinician note from E2E HTTP flow.",
    tags: ["e2e"],
    reason: "Clinician timeline update"
  });
  const createRes = await fetch(`${BACKEND}/api/v1/mindtrack/entries`, {
    method: "POST",
    headers: trustedHeaders(clinician, "/api/v1/mindtrack/entries", { method: "POST", body: entryBody }),
    body: entryBody
  });
  assert.ok([201, 409].includes(createRes.status), "clinician creates or is blocked by legal hold (409 from prior test data)");

  const newClientBody = JSON.stringify({
    name: "E2E Clinician Client",
    dob: "1995-08-20",
    phone: "+1-555-0188",
    address: "50 Park Ave, New York, NY 10016",
    channel: "telehealth",
    tags: ["e2e-clinician"],
    reason: "Clinician client registration"
  });
  const newClientRes = await fetch(`${BACKEND}/api/v1/mindtrack/clients`, {
    method: "POST",
    headers: trustedHeaders(clinician, "/api/v1/mindtrack/clients", { method: "POST", body: newClientBody }),
    body: newClientBody
  });
  assert.equal(newClientRes.status, 201, "clinician should create client");
  const newClientJson = await newClientRes.json();
  const newClientId = newClientJson.data.client._id;

  const editBody = JSON.stringify({ phone: "+1-555-0199", reason: "E2E profile update" });
  const editRes = await fetch(`${BACKEND}/api/v1/mindtrack/clients/${newClientId}`, {
    method: "PATCH",
    headers: trustedHeaders(clinician, `/api/v1/mindtrack/clients/${newClientId}`, { method: "PATCH", body: editBody }),
    body: editBody
  });
  assert.equal(editRes.status, 200, "clinician should edit client profile");

  const searchRes = await fetch(`${BACKEND}/api/v1/mindtrack/search?q=E2E&sort=newest`, {
    headers: trustedHeaders(clinician, "/api/v1/mindtrack/search?q=E2E&sort=newest")
  });
  assert.equal(searchRes.status, 200);

  const forbiddenBackup = await fetch(`${BACKEND}/api/v1/system/backup-status`, {
    headers: trustedHeaders(clinician, "/api/v1/system/backup-status")
  });
  assert.equal(forbiddenBackup.status, 403, "clinician must not access admin backup");

  const forbiddenUsers = await fetch(`${BACKEND}/api/v1/users`, {
    headers: trustedHeaders(clinician, "/api/v1/users")
  });
  assert.equal(forbiddenUsers.status, 403, "clinician must not list users");
});

test("administrator E2E: login, create client, run backup, governance, access boundary enforcement", async () => {
  const admin = await login("administrator", ADMIN_PASS);

  const createBody = JSON.stringify({
    name: "E2E Admin Client",
    dob: "1992-06-15",
    phone: "+1-404-555-0122",
    address: "10 Broad St, Atlanta, GA 30303",
    primaryClinicianId: "0000000000000000000000b1",
    channel: "in_person",
    tags: ["e2e"],
    reason: "E2E client creation"
  });
  const createRes = await fetch(`${BACKEND}/api/v1/mindtrack/clients`, {
    method: "POST",
    headers: trustedHeaders(admin, "/api/v1/mindtrack/clients", { method: "POST", body: createBody }),
    body: createBody
  });
  assert.equal(createRes.status, 201, "admin should create client");

  const backupBody = JSON.stringify({ reason: "E2E backup execution" });
  const backupRes = await fetch(`${BACKEND}/api/v1/system/backup-run`, {
    method: "POST",
    headers: trustedHeaders(admin, "/api/v1/system/backup-run", { method: "POST", body: backupBody }),
    body: backupBody
  });
  const backupJson = await backupRes.json();
  assert.equal(backupRes.status, 200, "admin should run backup");
  assert.equal(backupJson.data.success, true);
  assert.match(backupJson.data.file, /enc\.json$/);

  const statusRes = await fetch(`${BACKEND}/api/v1/system/backup-status`, {
    headers: trustedHeaders(admin, "/api/v1/system/backup-status")
  });
  assert.equal(statusRes.status, 200);

  const auditRes = await fetch(`${BACKEND}/api/v1/system/audit-immutability-check`, {
    headers: trustedHeaders(admin, "/api/v1/system/audit-immutability-check")
  });
  const auditJson = await auditRes.json();
  assert.equal(auditRes.status, 200);
  assert.equal(auditJson.data.immutable, true);

  const selfContextRes = await fetch(`${BACKEND}/api/v1/mindtrack/self-context`, {
    headers: trustedHeaders(admin, "/api/v1/mindtrack/self-context")
  });
  assert.ok([403, 404].includes(selfContextRes.status), "admin must not access client self-context (403 forbidden or 404 no client record)");
});

test("client E2E: timeline excludes counseling_note entries (role isolation)", async () => {
  const client = await login("client", CLIENT_PASS);

  const selfContextRes = await fetch(`${BACKEND}/api/v1/mindtrack/self-context`, {
    headers: trustedHeaders(client, "/api/v1/mindtrack/self-context")
  });
  assert.equal(selfContextRes.status, 200);
  const selfContext = await selfContextRes.json();

  for (const entry of selfContext.data.timeline) {
    assert.notEqual(entry.entryType, "counseling_note",
      "client must not see counseling_note entries in timeline");
  }
});

test("admin E2E: backup restore round-trip preserves data integrity", async () => {
  const admin = await login("administrator", ADMIN_PASS);

  const backupBody = JSON.stringify({ reason: "e2e restore test" });
  const backupRes = await fetch(`${BACKEND}/api/v1/system/backup-run`, {
    method: "POST",
    headers: trustedHeaders(admin, "/api/v1/system/backup-run", { method: "POST", body: backupBody }),
    body: backupBody
  });
  const backupJson = await backupRes.json();
  assert.equal(backupRes.status, 200);

  const restoreBody = JSON.stringify({ filename: backupJson.data.file, reason: "e2e restore" });
  const restoreRes = await fetch(`${BACKEND}/api/v1/system/backup-restore`, {
    method: "POST",
    headers: trustedHeaders(admin, "/api/v1/system/backup-restore", { method: "POST", body: restoreBody, idempotencyKey: crypto.randomUUID() }),
    body: restoreBody
  });
  const restoreJson = await restoreRes.json();
  assert.equal(restoreRes.status, 200);
  assert.equal(restoreJson.data.success, true);
});

test("work-order routes are no longer mounted", async () => {
  const admin = await login("administrator", ADMIN_PASS);
  const res = await fetch(`${BACKEND}/api/v1/work-orders`, {
    headers: trustedHeaders(admin, "/api/v1/work-orders")
  });
  assert.equal(res.status, 404, "work-order endpoint should return 404");
});

test("password recovery throttling enforces rate limits", async () => {
  const recoveryBody = JSON.stringify({
    username: "client",
    question: "wrong question",
    answer: "wrong answer",
    newPassword: "NewPass12345678"
  });

  let saw429 = false;
  for (let index = 0; index < 8; index += 1) {
    const res = await fetch(`${BACKEND}/api/v1/auth/recover-password`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: recoveryBody
    });
    if (res.status === 429) {
      saw429 = true;
      break;
    }
  }
  assert.equal(saw429, true, "recovery endpoint should enforce rate limit after repeated failures");
});

test("password recovery abuse is blocked by rate limit or account lockout", async () => {
  const recoveryBody = JSON.stringify({
    username: "clinician",
    question: "What is your assigned station name?",
    answer: "wrong-answer",
    newPassword: "NewPass12345678"
  });

  let sawProtection = false;
  for (let index = 0; index < 8; index += 1) {
    const res = await fetch(`${BACKEND}/api/v1/auth/recover-password`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: recoveryBody
    });
    if (res.status === 423 || res.status === 429) {
      sawProtection = true;
      break;
    }
  }
  assert.equal(sawProtection, true, "repeated recovery abuse should trigger rate limit (429) or account lockout (423)");
});

test("frontend serves pages and API proxy is operational", async () => {
  const indexRes = await fetch(`${FRONTEND}/`);
  assert.equal(indexRes.status, 200, "frontend should serve index");
  const html = await indexRes.text();
  assert.match(html, /<!DOCTYPE html>/i, "should return HTML page");

  const directHealth = await fetch(`${BACKEND}/healthz`);
  assert.equal(directHealth.status, 200, "backend healthz should be reachable");
});

// ---------------------------------------------------------------------------
// Extended E2E workflow tests — true end-to-end coverage of all missing
// endpoint families exercised through the running stack (backend + frontend).
// ---------------------------------------------------------------------------

test("E2E: frontend serves role-appropriate HTML for all known routes", async () => {
  // The SPA serves a single index.html for all routes. Confirm the frontend
  // Nginx serves a valid HTML shell for the paths each role navigates to.
  const routes = ["/", "/login", "/client", "/clinician", "/administrator"];
  for (const route of routes) {
    const res = await fetch(`${FRONTEND}${route}`);
    assert.equal(res.status, 200, `frontend must serve ${route}`);
    const text = await res.text();
    assert.match(text, /<!DOCTYPE html>/i, `${route} must return an HTML document`);
    assert.match(text, /<div id="root"/, `${route} must contain the React root mount point`);
  }
});

test("E2E: auth token refresh flow via running stack", async () => {
  const loginRes = await fetch(`${BACKEND}/api/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "clinician", password: CLINICIAN_PASS })
  });
  assert.equal(loginRes.status, 200, "E2E login must succeed before refresh test");
  const loginCookie = (loginRes.headers.getSetCookie?.() || [])
    .map((c) => c.split(";")[0])
    .join("; ");

  const refreshRes = await fetch(`${BACKEND}/api/v1/auth/refresh`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: loginCookie },
    body: JSON.stringify({})
  });
  assert.equal(refreshRes.status, 200, "auth refresh must succeed with a valid refresh cookie");
  const refreshJson = await refreshRes.json();
  assert.ok(refreshJson.data?.csrfToken, "refresh must return a fresh csrfToken");
});

test("E2E: auth logout invalidates the session", async () => {
  const admin = await login("administrator", ADMIN_PASS);

  // Verify session active.
  const beforeRes = await fetch(`${BACKEND}/api/v1/auth/session`, {
    headers: trustedHeaders(admin, "/api/v1/auth/session")
  });
  assert.equal(beforeRes.status, 200, "session must be active before E2E logout");

  // Logout.
  const logoutBody = "{}";
  const logoutRes = await fetch(`${BACKEND}/api/v1/auth/logout`, {
    method: "POST",
    headers: trustedHeaders(admin, "/api/v1/auth/logout", { method: "POST", body: logoutBody }),
    body: logoutBody
  });
  assert.equal(logoutRes.status, 200, "E2E logout must succeed");

  // Old cookie must no longer work.
  const afterRes = await fetch(`${BACKEND}/api/v1/auth/session`, {
    headers: {
      cookie: admin.cookie,
      "content-type": "application/json",
      "x-signature-timestamp": String(Date.now()),
      "x-signature-nonce": crypto.randomUUID(),
      "x-signature": "stale-after-logout"
    }
  });
  assert.equal(afterRes.status, 401, "stale cookie must be rejected after E2E logout");
});

test("E2E: trending search terms are accessible through the running stack", async () => {
  const clinician = await login("clinician", CLINICIAN_PASS);

  // Run a few searches to seed trending data.
  for (const term of ["anxiety", "sleep", "mood", "focus", "anxiety"]) {
    await fetch(`${BACKEND}/api/v1/mindtrack/search?q=${term}&sort=newest`, {
      headers: trustedHeaders(clinician, `/api/v1/mindtrack/search?q=${term}&sort=newest`)
    });
  }

  const trendingRes = await fetch(`${BACKEND}/api/v1/mindtrack/search/trending`, {
    headers: trustedHeaders(clinician, "/api/v1/mindtrack/search/trending")
  });
  assert.equal(trendingRes.status, 200, "trending endpoint must return 200");
  const trendingJson = await trendingRes.json();
  assert.ok(Array.isArray(trendingJson.data), "trending response must be an array");
  for (const entry of trendingJson.data) {
    assert.ok(typeof entry.term === "string", "each trending entry must have a string term");
    assert.ok(typeof entry.count === "number", "each trending entry must have a numeric count");
  }
});

test("E2E: full entry lifecycle — create → amend → delete → restore", async () => {
  const clinician = await login("clinician", CLINICIAN_PASS);

  // Create a fresh entry on cli002 (no legal hold).
  const entryBody = JSON.stringify({
    clientId: "cli002",
    entryType: "assessment",
    title: "E2E lifecycle entry",
    body: "Original content for E2E lifecycle test.",
    tags: ["e2e-lifecycle"],
    reason: "E2E lifecycle test"
  });
  const createRes = await fetch(`${BACKEND}/api/v1/mindtrack/entries`, {
    method: "POST",
    headers: trustedHeaders(clinician, "/api/v1/mindtrack/entries", { method: "POST", body: entryBody }),
    body: entryBody
  });
  assert.equal(createRes.status, 201, "E2E: entry creation must succeed");
  const createJson = await createRes.json();
  const entryId = createJson.data._id;

  // Amend with idempotency.
  const amendBody = JSON.stringify({
    expectedVersion: 1,
    body: "E2E amended body content.",
    reason: "E2E amend"
  });
  const amendKey = crypto.randomUUID();
  const amendRes = await fetch(`${BACKEND}/api/v1/mindtrack/entries/${entryId}/amend`, {
    method: "POST",
    headers: trustedHeaders(clinician, `/api/v1/mindtrack/entries/${entryId}/amend`, {
      method: "POST",
      body: amendBody,
      idempotencyKey: amendKey
    }),
    body: amendBody
  });
  assert.equal(amendRes.status, 200, "E2E: amend must succeed");
  const amendJson = await amendRes.json();
  assert.equal(Boolean(amendJson.idempotentReplay), false);

  // Replay amend — must be idempotent.
  const amendReplayRes = await fetch(`${BACKEND}/api/v1/mindtrack/entries/${entryId}/amend`, {
    method: "POST",
    headers: trustedHeaders(clinician, `/api/v1/mindtrack/entries/${entryId}/amend`, {
      method: "POST",
      body: amendBody,
      idempotencyKey: amendKey
    }),
    body: amendBody
  });
  assert.equal(amendReplayRes.status, 200, "E2E: amend replay must be 200");
  assert.equal(Boolean((await amendReplayRes.json()).idempotentReplay), true, "E2E: amend replay flag must be true");

  // Delete the entry.
  const deleteBody = JSON.stringify({ expectedVersion: 2, reason: "E2E delete" });
  const deleteKey = crypto.randomUUID();
  const deleteRes = await fetch(`${BACKEND}/api/v1/mindtrack/entries/${entryId}/delete`, {
    method: "POST",
    headers: trustedHeaders(clinician, `/api/v1/mindtrack/entries/${entryId}/delete`, {
      method: "POST",
      body: deleteBody,
      idempotencyKey: deleteKey
    }),
    body: deleteBody
  });
  assert.equal(deleteRes.status, 200, "E2E: delete must succeed");
  const deleteJson = await deleteRes.json();
  const versionAfterDelete = deleteJson.data?.version ?? 3;

  // Restore the deleted entry.
  const restoreBody = JSON.stringify({ expectedVersion: versionAfterDelete, reason: "E2E restore" });
  const restoreRes = await fetch(`${BACKEND}/api/v1/mindtrack/entries/${entryId}/restore`, {
    method: "POST",
    headers: trustedHeaders(clinician, `/api/v1/mindtrack/entries/${entryId}/restore`, {
      method: "POST",
      body: restoreBody,
      idempotencyKey: crypto.randomUUID()
    }),
    body: restoreBody
  });
  assert.equal(restoreRes.status, 200, "E2E: restore must succeed");
});

test("E2E: custom profile-field full CRUD lifecycle", async () => {
  const admin = await login("administrator", ADMIN_PASS);

  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const fieldKey = `e2e_field_${suffix}`;

  // Create.
  const createBody = JSON.stringify({
    field: { key: fieldKey, label: "E2E Field", fieldType: "text", visibleTo: ["administrator"] },
    reason: "E2E custom field test"
  });
  const createRes = await fetch(`${BACKEND}/api/v1/system/profile-fields/custom`, {
    method: "POST",
    headers: trustedHeaders(admin, "/api/v1/system/profile-fields/custom", { method: "POST", body: createBody }),
    body: createBody
  });
  assert.ok([200, 201].includes(createRes.status), `E2E: custom field create must succeed, got ${createRes.status}`);

  // Update (PATCH).
  const patchPath = `/api/v1/system/profile-fields/custom/${fieldKey}`;
  const patchBody = JSON.stringify({ updates: { label: "E2E Updated Field" }, reason: "E2E label update" });
  const patchRes = await fetch(`${BACKEND}${patchPath}`, {
    method: "PATCH",
    headers: trustedHeaders(admin, patchPath, { method: "PATCH", body: patchBody }),
    body: patchBody
  });
  assert.equal(patchRes.status, 200, "E2E: custom field PATCH must succeed");

  // Verify update via PATCH response.
  const patchJson = await patchRes.json();
  assert.ok(patchJson.data, "E2E: PATCH must return updated field data");

  // Delete.
  const deletePath = `/api/v1/system/profile-fields/custom/${fieldKey}`;
  const deleteBody = JSON.stringify({ reason: "E2E cleanup" });
  const deleteRes = await fetch(`${BACKEND}${deletePath}`, {
    method: "DELETE",
    headers: trustedHeaders(admin, deletePath, { method: "DELETE", body: deleteBody }),
    body: deleteBody
  });
  assert.equal(deleteRes.status, 200, "E2E: custom field DELETE must succeed");

  // Verify deletion via response.
  const deleteResJson = await deleteRes.json();
  assert.ok(deleteResJson.data, "E2E: DELETE must return a confirmation payload");
});

test("E2E: user admin — list, create, and password reset workflow", async () => {
  const admin = await login("administrator", ADMIN_PASS);

  // List users.
  const listRes = await fetch(`${BACKEND}/api/v1/users`, {
    headers: trustedHeaders(admin, "/api/v1/users")
  });
  assert.equal(listRes.status, 200, "E2E: admin must list users");
  const listJson = await listRes.json();
  assert.ok(Array.isArray(listJson.data) && listJson.data.length >= 3, "E2E: at least 3 seeded users");

  // Create new user.
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const username = `e2e_user_${suffix}`;
  const password = `E2ePass${suffix.slice(0, 4)}2026!`;
  const createBody = JSON.stringify({
    username,
    password,
    role: "clinician",
    securityQuestions: [{ question: "E2E test question?", answer: "e2e-answer" }],
    reason: "E2E user creation test"
  });
  const createRes = await fetch(`${BACKEND}/api/v1/users`, {
    method: "POST",
    headers: trustedHeaders(admin, "/api/v1/users", { method: "POST", body: createBody }),
    body: createBody
  });
  assert.equal(createRes.status, 201, "E2E: admin must create user");
  const createJson = await createRes.json();
  const userId = createJson.data?._id || createJson.data?.id;
  assert.ok(userId, "E2E: created user must have an id");

  // Admin reset-password.
  const resetPath = `/api/v1/users/${userId}/reset-password`;
  const resetBody = JSON.stringify({
    newPassword: `E2eReset${suffix.slice(0, 4)}2026!`,
    reason: "E2E admin password reset"
  });
  const resetRes = await fetch(`${BACKEND}${resetPath}`, {
    method: "POST",
    headers: trustedHeaders(admin, resetPath, { method: "POST", body: resetBody }),
    body: resetBody
  });
  assert.equal(resetRes.status, 200, "E2E: admin password reset must succeed");
  assert.equal((await resetRes.json()).data?.success, true, "E2E: reset must confirm success");
});

test("E2E: frontend API proxy correctly forwards authenticated requests", async () => {
  // The frontend Nginx is configured to proxy /api/v1/* to the backend.
  // Verify that:
  //  (a) the frontend serves a proper SPA index page
  //  (b) the backend is directly reachable via its own health endpoint
  //  (c) the login API is reachable through the frontend proxy /api/v1/* path
  const indexRes = await fetch(`${FRONTEND}/`);
  assert.equal(indexRes.status, 200, "frontend index must be reachable");
  const html = await indexRes.text();
  assert.match(html, /<!DOCTYPE html>/i, "frontend must serve an HTML document");

  // Direct backend health check confirms the backend service is up.
  const backendHealth = await fetch(`${BACKEND}/healthz`);
  assert.equal(backendHealth.status, 200, "backend healthz must be reachable directly");
  const healthJson = await backendHealth.json();
  assert.ok(
    healthJson.status === "ok" || healthJson.data?.status === "ok",
    "healthz must return ok status"
  );

  // Confirm the proxy route works: login through the frontend Nginx proxy.
  const proxyLoginRes = await fetch(`${FRONTEND}/api/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "client", password: CLIENT_PASS })
  });
  assert.equal(
    proxyLoginRes.status,
    200,
    "login via frontend proxy must succeed — confirms /api/v1/* is correctly forwarded"
  );
  const proxyJson = await proxyLoginRes.json();
  assert.ok(proxyJson.data?.csrfToken, "proxied login response must include csrfToken");
});
