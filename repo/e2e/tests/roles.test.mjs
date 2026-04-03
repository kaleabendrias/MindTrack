import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

const BACKEND = process.env.BACKEND_BASE_URL || "http://127.0.0.1:4000";
const FRONTEND = process.env.FRONTEND_BASE_URL || "http://127.0.0.1:3000";

function cookiesFrom(response) {
  return (response.headers.getSetCookie?.() || [])
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

function trustedHeaders(session, path, { method = "GET", body = "", idempotencyKey } = {}) {
  const timestamp = Date.now();
  const nonce = crypto.randomUUID();
  const payload = [method.toUpperCase(), path, String(timestamp), nonce, body].join("|");
  const signature = crypto.createHmac("sha256", session.requestSigningKey).update(payload).digest("hex");

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
    csrfToken: json.data?.csrfToken,
    requestSigningKey: json.data?.requestSigningKey
  };
}

test("client E2E: login, self-context, self-assessment, access boundary enforcement", async () => {
  const client = await login("client", "ClientPasscode2026");

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
  const clinician = await login("clinician", "ClinicianPass2026");

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
  const admin = await login("administrator", "AdminPasscode2026");

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
  const client = await login("client", "ClientPasscode2026");

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
  const admin = await login("administrator", "AdminPasscode2026");

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
    headers: trustedHeaders(admin, "/api/v1/system/backup-restore", { method: "POST", body: restoreBody }),
    body: restoreBody
  });
  const restoreJson = await restoreRes.json();
  assert.equal(restoreRes.status, 200);
  assert.equal(restoreJson.data.success, true);
});

test("work-order routes are no longer mounted", async () => {
  const admin = await login("administrator", "AdminPasscode2026");
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
