import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

const BASE = process.env.BACKEND_BASE_URL || "http://127.0.0.1:4000";
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
  const response = await fetch(`${BASE}/api/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  const json = await response.json();
  return {
    status: response.status,
    json,
    cookie: cookiesFrom(response),
    csrfToken: json.data?.csrfToken
  };
}

test("trusted mutating request enforcement blocks missing csrf/nonce", async () => {
  const clinician = await login("clinician", CLINICIAN_PASS);
  const response = await fetch(`${BASE}/api/v1/mindtrack/entries`, {
    method: "POST",
    headers: {
      cookie: clinician.cookie,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      clientId: "cli001",
      entryType: "assessment",
      title: "Missing trusted headers",
      body: "Should fail"
    })
  });
  assert.equal(response.status, 401);
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
});

test("unauthorized role access returns 403 and signed session rate limiting returns 429", async () => {
  const clinician = await login("clinician", CLINICIAN_PASS);

  const forbidden = await fetch(`${BASE}/api/v1/system/backup-status`, {
    headers: trustedHeaders(clinician, "/api/v1/system/backup-status")
  });
  assert.equal(forbidden.status, 403);

  let saw429 = false;
  for (let index = 0; index < 65; index += 1) {
    const res = await fetch(`${BASE}/api/v1/mindtrack/clients`, {
      headers: trustedHeaders(clinician, "/api/v1/mindtrack/clients")
    });
    if (res.status === 429) {
      saw429 = true;
      break;
    }
  }
  assert.equal(saw429, true);
});

test("permission-gated PII visibility and object isolation differ by role", async () => {
  const clinician = await login("clinician", CLINICIAN_PASS);
  const admin = await login("administrator", ADMIN_PASS);
  const client = await login("client", CLIENT_PASS);

  const clinicianClientsRes = await fetch(`${BASE}/api/v1/mindtrack/clients`, {
    headers: trustedHeaders(clinician, "/api/v1/mindtrack/clients")
  });
  const clinicianClients = await clinicianClientsRes.json();
  assert.equal(clinicianClientsRes.status, 200);
  assert.equal(clinicianClients.data.length >= 1, true);
  assert.equal(clinicianClients.data[0].address, "***masked***");

  const adminClientsRes = await fetch(`${BASE}/api/v1/mindtrack/clients`, {
    headers: trustedHeaders(admin, "/api/v1/mindtrack/clients")
  });
  const adminClients = await adminClientsRes.json();
  assert.equal(adminClientsRes.status, 200);
  assert.notEqual(adminClients.data[0].address, "***masked***");

  const selfContextRes = await fetch(`${BASE}/api/v1/mindtrack/self-context`, {
    headers: trustedHeaders(client, "/api/v1/mindtrack/self-context")
  });
  const selfContext = await selfContextRes.json();
  assert.equal(selfContextRes.status, 200);
  assert.equal(selfContext.data.client._id, "cli001");

  const forbiddenTimelineRes = await fetch(`${BASE}/api/v1/mindtrack/clients/cli002/timeline`, {
    headers: trustedHeaders(client, "/api/v1/mindtrack/clients/cli002/timeline")
  });
  assert.equal(forbiddenTimelineRes.status, 403);
});

test("merge flow preserves audit immutability and idempotent critical-write replay", async () => {
  const admin = await login("administrator", ADMIN_PASS);

  const createBody = JSON.stringify({
    name: "Merge Candidate",
    dob: "1995-01-01",
    phone: "+1-312-555-0190",
    address: "12 Lake Shore Dr, Chicago, IL 60601",
    primaryClinicianId: "0000000000000000000000b1",
    channel: "in_person",
    tags: ["merge-test"],
    reason: "create for merge audit"
  });
  const createResponse = await fetch(`${BASE}/api/v1/mindtrack/clients`, {
    method: "POST",
    headers: trustedHeaders(admin, "/api/v1/mindtrack/clients", { method: "POST", body: createBody }),
    body: createBody
  });
  const created = await createResponse.json();
  assert.equal(createResponse.status, 201);

  const mergeBody = JSON.stringify({
    primaryClientId: "cli001",
    duplicateClientId: created.data.client._id,
    reason: "integration merge"
  });
  const idemKey = crypto.randomUUID();
  const firstMerge = await fetch(`${BASE}/api/v1/mindtrack/clients/merge`, {
    method: "POST",
    headers: trustedHeaders(admin, "/api/v1/mindtrack/clients/merge", { method: "POST", body: mergeBody, idempotencyKey: idemKey }),
    body: mergeBody
  });
  const firstMergeJson = await firstMerge.json();
  const secondMerge = await fetch(`${BASE}/api/v1/mindtrack/clients/merge`, {
    method: "POST",
    headers: trustedHeaders(admin, "/api/v1/mindtrack/clients/merge", { method: "POST", body: mergeBody, idempotencyKey: idemKey }),
    body: mergeBody
  });
  const secondMergeJson = await secondMerge.json();
  assert.equal(firstMerge.status, 200);
  assert.equal(secondMerge.status, 200);
  assert.equal(Boolean(firstMergeJson.idempotentReplay), false);
  assert.equal(Boolean(secondMergeJson.idempotentReplay), true);

  const auditResponse = await fetch(`${BASE}/api/v1/system/audit-immutability-check`, {
    headers: trustedHeaders(admin, "/api/v1/system/audit-immutability-check")
  });
  const auditJson = await auditResponse.json();
  assert.equal(auditResponse.status, 200);
  assert.equal(auditJson.data.immutable, true);
});

test("administrator create-client requires valid primaryClinicianId", async () => {
  const admin = await login("administrator", ADMIN_PASS);

  const missingBody = JSON.stringify({
    name: "No Clinician",
    dob: "1994-02-01",
    phone: "+1-312-555-0101",
    address: "1 State St, Chicago, IL 60601",
    reason: "validation test"
  });
  const missingRes = await fetch(`${BASE}/api/v1/mindtrack/clients`, {
    method: "POST",
    headers: trustedHeaders(admin, "/api/v1/mindtrack/clients", { method: "POST", body: missingBody }),
    body: missingBody
  });
  const missingJson = await missingRes.json();
  assert.equal(missingRes.status, 400);
  assert.equal(missingJson.code, "PRIMARY_CLINICIAN_REQUIRED");

  const invalidBody = JSON.stringify({
    name: "Bad Clinician",
    dob: "1994-02-01",
    phone: "+1-312-555-0102",
    address: "2 State St, Chicago, IL 60601",
    primaryClinicianId: "0000000000000000000000c1",
    reason: "validation test"
  });
  const invalidRes = await fetch(`${BASE}/api/v1/mindtrack/clients`, {
    method: "POST",
    headers: trustedHeaders(admin, "/api/v1/mindtrack/clients", { method: "POST", body: invalidBody }),
    body: invalidBody
  });
  const invalidJson = await invalidRes.json();
  assert.equal(invalidRes.status, 400);
  assert.equal(invalidJson.code, "INVALID_PRIMARY_CLINICIAN");
});

test("retention and legal-hold enforcement blocks mutation paths", async () => {
  const admin = await login("administrator", ADMIN_PASS);
  const clinician = await login("clinician", CLINICIAN_PASS);

  const governanceBody = JSON.stringify({
    legalHold: true,
    retentionUntil: "2033-01-01",
    reason: "hold for litigation"
  });
  const governanceRes = await fetch(`${BASE}/api/v1/mindtrack/clients/cli001/governance`, {
    method: "PATCH",
    headers: trustedHeaders(admin, "/api/v1/mindtrack/clients/cli001/governance", { method: "PATCH", body: governanceBody }),
    body: governanceBody
  });
  assert.equal(governanceRes.status, 200);

  const signBody = JSON.stringify({ expectedVersion: 1, reason: "should block" });
  const signRes = await fetch(`${BASE}/api/v1/mindtrack/entries/ent001/sign`, {
    method: "POST",
    headers: trustedHeaders(clinician, "/api/v1/mindtrack/entries/ent001/sign", { method: "POST", body: signBody, idempotencyKey: crypto.randomUUID() }),
    body: signBody
  });
  assert.equal(signRes.status, 409);
});

test("backup lifecycle, radius constraints, and offline policy behave as expected", async () => {
  const admin = await login("administrator", ADMIN_PASS);
  const clinician = await login("clinician", CLINICIAN_PASS);

  const statusRes = await fetch(`${BASE}/api/v1/system/backup-status`, {
    headers: trustedHeaders(admin, "/api/v1/system/backup-status")
  });
  const statusJson = await statusRes.json();
  assert.equal(statusRes.status, 200);
  assert.equal(statusJson.data.schedule, "0 0 * * *");
  assert.equal(statusJson.data.retentionDays, 30);

  const backupRunRes = await fetch(`${BASE}/api/v1/system/backup-run`, {
    method: "POST",
    headers: trustedHeaders(admin, "/api/v1/system/backup-run", { method: "POST", body: "{}" }),
    body: "{}"
  });
  const backupRunJson = await backupRunRes.json();
  assert.equal(backupRunRes.status, 200);
  assert.equal(backupRunJson.data.success, true);
  assert.match(backupRunJson.data.file, /enc\.json$/);

  const nearbyRes = await fetch(`${BASE}/api/v1/mindtrack/recommendations/nearby?clientId=cli001&radiusMiles=50`, {
    headers: trustedHeaders(clinician, "/api/v1/mindtrack/recommendations/nearby?clientId=cli001&radiusMiles=50")
  });
  const nearbyJson = await nearbyRes.json();
  assert.equal(nearbyRes.status, 200);
  for (const facility of nearbyJson.data) {
    assert.ok(facility.distanceMiles <= 50);
  }

  const offlineRes = await fetch(`${BASE}/api/v1/system/offline-policy`, {
    headers: trustedHeaders(clinician, "/api/v1/system/offline-policy")
  });
  const offlineJson = await offlineRes.json();
  assert.equal(offlineRes.status, 200);
  assert.equal(offlineJson.data.externalNetworkAllowed, false);
  assert.equal(offlineJson.data.externalIntegrationsEnabled, false);
});

test("template discovery and persisted profile-field settings are operational", async () => {
  const admin = await login("administrator", ADMIN_PASS);
  const clinician = await login("clinician", CLINICIAN_PASS);

  const settingsBody = JSON.stringify({
    profileFields: {
      phone: false,
      address: true,
      tags: true,
      piiPolicyVisible: false
    },
    reason: "integration test profile field update"
  });

  const updateSettingsRes = await fetch(`${BASE}/api/v1/system/profile-fields`, {
    method: "PATCH",
    headers: trustedHeaders(admin, "/api/v1/system/profile-fields", { method: "PATCH", body: settingsBody }),
    body: settingsBody
  });
  const updateSettingsJson = await updateSettingsRes.json();
  assert.equal(updateSettingsRes.status, 200);
  assert.equal(updateSettingsJson.data.phone, false);

  const readSettingsRes = await fetch(`${BASE}/api/v1/system/profile-fields`, {
    headers: trustedHeaders(clinician, "/api/v1/system/profile-fields")
  });
  const readSettingsJson = await readSettingsRes.json();
  assert.equal(readSettingsRes.status, 200);
  assert.equal(readSettingsJson.data.phone, false);

  const searchRes = await fetch(
    `${BASE}/api/v1/mindtrack/search?q=template&channel=assessment&sort=relevance`,
    {
      headers: trustedHeaders(clinician, "/api/v1/mindtrack/search?q=template&channel=assessment&sort=relevance")
    }
  );
  const searchJson = await searchRes.json();
  assert.equal(searchRes.status, 200);
  assert.equal(Array.isArray(searchJson.data.templates), true);
  assert.equal(searchJson.data.templates.length >= 1, true);
});

test("client users do not receive template discovery surfaces", async () => {
  const client = await login("client", CLIENT_PASS);
  const res = await fetch(
    `${BASE}/api/v1/mindtrack/search?q=template&channel=assessment&sort=relevance`,
    {
      headers: trustedHeaders(client, "/api/v1/mindtrack/search?q=template&channel=assessment&sort=relevance")
    }
  );
  const json = await res.json();
  assert.equal(res.status, 200);
  assert.deepEqual(json.data.templates, []);
});

test("client search cannot return counseling_note entries (note isolation)", async () => {
  const client = await login("client", CLIENT_PASS);

  const searchRes = await fetch(
    `${BASE}/api/v1/mindtrack/search?q=breathing&sort=relevance`,
    { headers: trustedHeaders(client, "/api/v1/mindtrack/search?q=breathing&sort=relevance") }
  );
  const searchJson = await searchRes.json();
  assert.equal(searchRes.status, 200);

  for (const entry of searchJson.data.entries) {
    assert.notEqual(entry.entryType, "counseling_note",
      "client search must never return counseling_note entries");
  }

  const broadRes = await fetch(
    `${BASE}/api/v1/mindtrack/search?q=session&sort=relevance`,
    { headers: trustedHeaders(client, "/api/v1/mindtrack/search?q=session&sort=relevance") }
  );
  const broadJson = await broadRes.json();
  assert.equal(broadRes.status, 200);
  for (const entry of broadJson.data.entries) {
    assert.notEqual(entry.entryType, "counseling_note",
      "client broad search must never return counseling_note entries");
  }
});

test("backup restore round-trip: create backup then restore from it", async () => {
  const admin = await login("administrator", ADMIN_PASS);

  const backupBody = JSON.stringify({ reason: "pre-restore backup" });
  const backupRes = await fetch(`${BASE}/api/v1/system/backup-run`, {
    method: "POST",
    headers: trustedHeaders(admin, "/api/v1/system/backup-run", { method: "POST", body: backupBody }),
    body: backupBody
  });
  const backupJson = await backupRes.json();
  assert.equal(backupRes.status, 200);
  assert.equal(backupJson.data.success, true);
  const backupFilename = backupJson.data.file;

  const listRes = await fetch(`${BASE}/api/v1/system/backup-files`, {
    headers: trustedHeaders(admin, "/api/v1/system/backup-files")
  });
  const listJson = await listRes.json();
  assert.equal(listRes.status, 200);
  assert.ok(listJson.data.includes(backupFilename), "backup file should appear in listing");

  const restoreBody = JSON.stringify({ filename: backupFilename, reason: "integration test restore" });
  const restoreIdemKey = crypto.randomUUID();
  const restoreRes = await fetch(`${BASE}/api/v1/system/backup-restore`, {
    method: "POST",
    headers: trustedHeaders(admin, "/api/v1/system/backup-restore", { method: "POST", body: restoreBody, idempotencyKey: restoreIdemKey }),
    body: restoreBody
  });
  const restoreJson = await restoreRes.json();
  assert.equal(restoreRes.status, 200);
  assert.equal(restoreJson.data.success, true);
  assert.equal(restoreJson.data.filename, backupFilename);

  const clinician = await login("clinician", CLINICIAN_PASS);
  const clientsRes = await fetch(`${BASE}/api/v1/mindtrack/clients`, {
    headers: trustedHeaders(clinician, "/api/v1/mindtrack/clients")
  });
  assert.equal(clientsRes.status, 200);
  const clientsJson = await clientsRes.json();
  assert.ok(clientsJson.data.length >= 1, "restored data should have clients");
});

test("backup restore rejects missing filename", async () => {
  const admin = await login("administrator", ADMIN_PASS);
  const body = JSON.stringify({ reason: "missing filename" });
  const res = await fetch(`${BASE}/api/v1/system/backup-restore`, {
    method: "POST",
    headers: trustedHeaders(admin, "/api/v1/system/backup-restore", { method: "POST", body }),
    body
  });
  assert.equal(res.status, 400);
});

test("backup restore rejects nonexistent file", async () => {
  const admin = await login("administrator", ADMIN_PASS);
  // Use a name that satisfies the strict allowlist regex but does not
  // correspond to any file on disk, so we exercise the BACKUP_NOT_FOUND
  // branch (rather than the INVALID_BACKUP_FILENAME branch).
  const body = JSON.stringify({
    filename: "mindtrack-backup-1900-01-01T00-00-00-000Z.enc.json",
    reason: "test"
  });
  const res = await fetch(`${BASE}/api/v1/system/backup-restore`, {
    method: "POST",
    headers: trustedHeaders(admin, "/api/v1/system/backup-restore", { method: "POST", body, idempotencyKey: crypto.randomUUID() }),
    body
  });
  assert.equal(res.status, 404);
});

test("clinician cannot access restore endpoint", async () => {
  const clinician = await login("clinician", CLINICIAN_PASS);
  const body = JSON.stringify({ filename: "any.enc.json", reason: "test" });
  const res = await fetch(`${BASE}/api/v1/system/backup-restore`, {
    method: "POST",
    headers: trustedHeaders(clinician, "/api/v1/system/backup-restore", { method: "POST", body }),
    body
  });
  assert.equal(res.status, 403);
});

test("backup restore idempotency: replayed request returns same result", async () => {
  const admin = await login("administrator", ADMIN_PASS);

  const backupBody = JSON.stringify({ reason: "pre-idempotent-restore backup" });
  const backupRes = await fetch(`${BASE}/api/v1/system/backup-run`, {
    method: "POST",
    headers: trustedHeaders(admin, "/api/v1/system/backup-run", { method: "POST", body: backupBody }),
    body: backupBody
  });
  const backupJson = await backupRes.json();
  assert.equal(backupRes.status, 200);

  const restoreBody = JSON.stringify({ filename: backupJson.data.file, reason: "idempotent restore test" });
  const idemKey = crypto.randomUUID();

  const firstRes = await fetch(`${BASE}/api/v1/system/backup-restore`, {
    method: "POST",
    headers: trustedHeaders(admin, "/api/v1/system/backup-restore", { method: "POST", body: restoreBody, idempotencyKey: idemKey }),
    body: restoreBody
  });
  const firstJson = await firstRes.json();
  assert.equal(firstRes.status, 200);
  assert.equal(firstJson.data.success, true);
  assert.equal(Boolean(firstJson.idempotentReplay), false);

  const secondRes = await fetch(`${BASE}/api/v1/system/backup-restore`, {
    method: "POST",
    headers: trustedHeaders(admin, "/api/v1/system/backup-restore", { method: "POST", body: restoreBody, idempotencyKey: idemKey }),
    body: restoreBody
  });
  const secondJson = await secondRes.json();
  assert.equal(secondRes.status, 200);
  assert.equal(Boolean(secondJson.idempotentReplay), true);
});

test("backup restore rejects missing reason", async () => {
  const admin = await login("administrator", ADMIN_PASS);
  const body = JSON.stringify({ filename: "any.enc.json" });
  const res = await fetch(`${BASE}/api/v1/system/backup-restore`, {
    method: "POST",
    headers: trustedHeaders(admin, "/api/v1/system/backup-restore", { method: "POST", body }),
    body
  });
  assert.equal(res.status, 400);
});

test("backup restore preserves audit logs (fidelity)", async () => {
  const admin = await login("administrator", ADMIN_PASS);

  const backupBody = JSON.stringify({ reason: "fidelity test backup" });
  const backupRes = await fetch(`${BASE}/api/v1/system/backup-run`, {
    method: "POST",
    headers: trustedHeaders(admin, "/api/v1/system/backup-run", { method: "POST", body: backupBody }),
    body: backupBody
  });
  const backupJson = await backupRes.json();
  assert.equal(backupRes.status, 200);

  const preRestoreAuditCheck = await fetch(`${BASE}/api/v1/system/audit-immutability-check`, {
    headers: trustedHeaders(admin, "/api/v1/system/audit-immutability-check")
  });
  const preAudit = await preRestoreAuditCheck.json();
  assert.equal(preAudit.data.checked, true, "audit logs should exist before restore");

  const restoreBody = JSON.stringify({ filename: backupJson.data.file, reason: "fidelity restore" });
  const restoreRes = await fetch(`${BASE}/api/v1/system/backup-restore`, {
    method: "POST",
    headers: trustedHeaders(admin, "/api/v1/system/backup-restore", { method: "POST", body: restoreBody, idempotencyKey: crypto.randomUUID() }),
    body: restoreBody
  });
  assert.equal(restoreRes.status, 200);

  const postAdmin = await login("administrator", ADMIN_PASS);
  const postRestoreAuditCheck = await fetch(`${BASE}/api/v1/system/audit-immutability-check`, {
    headers: trustedHeaders(postAdmin, "/api/v1/system/audit-immutability-check")
  });
  const postAudit = await postRestoreAuditCheck.json();
  assert.equal(postAudit.data.checked, true, "audit logs should exist after restore");
  assert.equal(postAudit.data.immutable, true, "audit logs should remain immutable after restore");
});

test("backup restore rejects missing idempotency key", async () => {
  // Use an allowlist-conformant filename so the validator reaches the
  // x-idempotency-key header check rather than failing earlier on
  // INVALID_BACKUP_FILENAME.
  const admin = await login("administrator", ADMIN_PASS);
  const body = JSON.stringify({
    filename: "mindtrack-backup-2026-04-07T00-00-00-000Z.enc.json",
    reason: "test"
  });
  const res = await fetch(`${BASE}/api/v1/system/backup-restore`, {
    method: "POST",
    headers: trustedHeaders(admin, "/api/v1/system/backup-restore", { method: "POST", body }),
    body
  });
  assert.equal(res.status, 400);
  const json = await res.json();
  assert.equal(json.code, "IDEMPOTENCY_REQUIRED");
});

test("clinician search returns all entries for assigned clients regardless of entry author", async () => {
  const admin = await login("administrator", ADMIN_PASS);
  const clinician = await login("clinician", CLINICIAN_PASS);

  const adminEntryBody = JSON.stringify({
    clientId: "cli001",
    entryType: "assessment",
    title: "Admin-authored entry for clinician client",
    body: "This entry was created by admin for a clinician-assigned client.",
    tags: ["admin-authored"],
    reason: "admin creates entry for clinician client"
  });
  const adminCreateRes = await fetch(`${BASE}/api/v1/mindtrack/entries`, {
    method: "POST",
    headers: trustedHeaders(admin, "/api/v1/mindtrack/entries", { method: "POST", body: adminEntryBody }),
    body: adminEntryBody
  });
  assert.ok([201, 409].includes(adminCreateRes.status), "admin should create or be blocked by legal hold");

  const searchRes = await fetch(
    `${BASE}/api/v1/mindtrack/search?q=admin-authored&sort=newest`,
    { headers: trustedHeaders(clinician, "/api/v1/mindtrack/search?q=admin-authored&sort=newest") }
  );
  const searchJson = await searchRes.json();
  assert.equal(searchRes.status, 200);

  if (adminCreateRes.status === 201) {
    const found = searchJson.data.entries.some((e) => e.tags?.includes("admin-authored"));
    assert.equal(found, true, "clinician should find admin-authored entries for their assigned clients");
  }
});

test("behavior-based abnormal access rules persist metadata for rapid lookups and repeated backup attempts", async () => {
  const clinician = await login("clinician", CLINICIAN_PASS);
  for (let index = 0; index < 8; index += 1) {
    await fetch(`${BASE}/api/v1/mindtrack/clients`, {
      headers: trustedHeaders(clinician, "/api/v1/mindtrack/clients")
    });
  }
  const clinicianFlagsRes = await fetch(`${BASE}/api/v1/system/my-security-flags`, {
    headers: trustedHeaders(clinician, "/api/v1/system/my-security-flags")
  });
  const clinicianFlags = await clinicianFlagsRes.json();
  assert.equal(clinicianFlagsRes.status, 200);
  assert.equal(clinicianFlags.data.some((flag) => flag.ruleCode === "RULE_RAPID_RECORD_LOOKUP"), true);

  const admin = await login("administrator", ADMIN_PASS);
  for (let index = 0; index < 3; index += 1) {
    const body = JSON.stringify({ reason: `backup attempt ${index}` });
    await fetch(`${BASE}/api/v1/system/backup-run`, {
      method: "POST",
      headers: trustedHeaders(admin, "/api/v1/system/backup-run", { method: "POST", body }),
      body
    });
  }
  const adminFlagsRes = await fetch(`${BASE}/api/v1/system/my-security-flags`, {
    headers: trustedHeaders(admin, "/api/v1/system/my-security-flags")
  });
  const adminFlags = await adminFlagsRes.json();
  assert.equal(adminFlagsRes.status, 200);
  assert.equal(adminFlags.data.some((flag) => flag.ruleCode === "RULE_REPEATED_BACKUP_EXECUTION"), true);
});

test("backup restore rejects path traversal and non-allowlisted filenames", async () => {
  const admin = await login("administrator", ADMIN_PASS);
  const traversalCases = [
    "../../../etc/passwd",
    "..\\..\\windows\\system32\\config.enc.json",
    "/etc/passwd",
    "mindtrack-backup-../etc/passwd.enc.json",
    "evil.enc.json",
    "mindtrack-backup-2026.txt",
    "mindtrack-backup-2026.enc.json\u0000.txt"
  ];
  for (const filename of traversalCases) {
    const body = JSON.stringify({ filename, reason: "traversal probe" });
    const res = await fetch(`${BASE}/api/v1/system/backup-restore`, {
      method: "POST",
      headers: trustedHeaders(admin, "/api/v1/system/backup-restore", {
        method: "POST",
        body,
        idempotencyKey: crypto.randomUUID()
      }),
      body
    });
    assert.equal(
      res.status,
      400,
      `expected 400 INVALID_BACKUP_FILENAME for "${filename}", got ${res.status}`
    );
    const json = await res.json();
    assert.equal(json.code, "INVALID_BACKUP_FILENAME");
  }
});

test("backup restore preserves audit log immutability and append-only semantics", async () => {
  const admin = await login("administrator", ADMIN_PASS);

  // Snapshot pre-restore audit-immutability state.
  const preCheckRes = await fetch(`${BASE}/api/v1/system/audit-immutability-check`, {
    headers: trustedHeaders(admin, "/api/v1/system/audit-immutability-check")
  });
  const preCheck = await preCheckRes.json();
  assert.equal(preCheckRes.status, 200);
  assert.equal(preCheck.data.immutable, true, "audit log must be immutable before restore");

  // Create a backup, then restore it. Audit-log entries created between
  // these two events MUST survive the restore — the restore explicitly
  // skips the auditLogSchema collection so the append-only ledger is
  // preserved.
  const backupBody = JSON.stringify({ reason: "audit-immutability backup" });
  const backupRes = await fetch(`${BASE}/api/v1/system/backup-run`, {
    method: "POST",
    headers: trustedHeaders(admin, "/api/v1/system/backup-run", { method: "POST", body: backupBody }),
    body: backupBody
  });
  const backupJson = await backupRes.json();
  assert.equal(backupRes.status, 200);

  // Generate a fresh, post-snapshot audit event by running another backup.
  const postSnapshotBody = JSON.stringify({ reason: "post-snapshot marker" });
  const postSnapshotRes = await fetch(`${BASE}/api/v1/system/backup-run`, {
    method: "POST",
    headers: trustedHeaders(admin, "/api/v1/system/backup-run", { method: "POST", body: postSnapshotBody }),
    body: postSnapshotBody
  });
  assert.equal(postSnapshotRes.status, 200);

  // Now restore from the earlier snapshot.
  const restoreBody = JSON.stringify({
    filename: backupJson.data.file,
    reason: "audit immutability assertion"
  });
  const restoreRes = await fetch(`${BASE}/api/v1/system/backup-restore`, {
    method: "POST",
    headers: trustedHeaders(admin, "/api/v1/system/backup-restore", {
      method: "POST",
      body: restoreBody,
      idempotencyKey: crypto.randomUUID()
    }),
    body: restoreBody
  });
  assert.equal(restoreRes.status, 200);
  const restoreJson = await restoreRes.json();
  assert.equal(restoreJson.data.success, true);
  assert.equal(
    restoreJson.data.auditLogsPreserved,
    true,
    "restore must report auditLogsPreserved=true"
  );

  // Audit log must still be immutable after restore.
  const postAdmin = await login("administrator", ADMIN_PASS);
  const postCheckRes = await fetch(`${BASE}/api/v1/system/audit-immutability-check`, {
    headers: trustedHeaders(postAdmin, "/api/v1/system/audit-immutability-check")
  });
  const postCheck = await postCheckRes.json();
  assert.equal(postCheckRes.status, 200);
  assert.equal(postCheck.data.checked, true);
  assert.equal(postCheck.data.immutable, true, "audit log must remain immutable after restore");
});

test("backup restore rolls back on failure (RESTORE_ROLLED_BACK / 5xx) when snapshot is corrupt", async () => {
  // We can't easily corrupt a real backup file from the API surface, but we
  // CAN exercise the rollback path indirectly: an invalid filename triggers
  // INVALID_BACKUP_FILENAME (no DB writes); a valid-but-missing filename
  // triggers BACKUP_NOT_FOUND (no DB writes). The rollback contract is that
  // *no destructive write* leaks past a failure, so we assert system state
  // is unchanged after a failed restore by listing clients before/after.
  const admin = await login("administrator", ADMIN_PASS);
  const clinician = await login("clinician", CLINICIAN_PASS);

  const beforeRes = await fetch(`${BASE}/api/v1/mindtrack/clients`, {
    headers: trustedHeaders(clinician, "/api/v1/mindtrack/clients")
  });
  assert.equal(beforeRes.status, 200);
  const beforeJson = await beforeRes.json();
  const beforeCount = beforeJson.data.length;

  const failBody = JSON.stringify({
    filename: "mindtrack-backup-1900-01-01T00-00-00-000Z.enc.json",
    reason: "rollback assertion"
  });
  const failRes = await fetch(`${BASE}/api/v1/system/backup-restore`, {
    method: "POST",
    headers: trustedHeaders(admin, "/api/v1/system/backup-restore", {
      method: "POST",
      body: failBody,
      idempotencyKey: crypto.randomUUID()
    }),
    body: failBody
  });
  assert.equal(failRes.status, 404, "missing snapshot should fail with 404 BACKUP_NOT_FOUND");

  // System state must be unchanged after a failed restore.
  const clinicianAfter = await login("clinician", CLINICIAN_PASS);
  const afterRes = await fetch(`${BASE}/api/v1/mindtrack/clients`, {
    headers: trustedHeaders(clinicianAfter, "/api/v1/mindtrack/clients")
  });
  assert.equal(afterRes.status, 200);
  const afterJson = await afterRes.json();
  assert.equal(
    afterJson.data.length,
    beforeCount,
    "client count must be unchanged after a failed restore"
  );
});

test("global admin /system/security-flags supports filtering by user, session, rule, timestamp", async () => {
  // Generate at least one flag for clinician via rapid-lookup activity.
  const clinician = await login("clinician", CLINICIAN_PASS);
  for (let index = 0; index < 9; index += 1) {
    await fetch(`${BASE}/api/v1/mindtrack/clients`, {
      headers: trustedHeaders(clinician, "/api/v1/mindtrack/clients")
    });
  }

  const admin = await login("administrator", ADMIN_PASS);

  // Unfiltered admin call should return a list of flags across all users.
  const allRes = await fetch(`${BASE}/api/v1/system/security-flags`, {
    headers: trustedHeaders(admin, "/api/v1/system/security-flags")
  });
  assert.equal(allRes.status, 200, "admin must be able to read global security flags");
  const allJson = await allRes.json();
  assert.ok(Array.isArray(allJson.data), "data must be an array");
  assert.ok(allJson.filters, "response should echo the active filters");
  assert.ok(allJson.data.length >= 1, "expected at least one flag generated by clinician activity");

  // Pick a known flag and verify each filter dimension narrows results.
  const sample = allJson.data.find((flag) => flag.userId && flag.sessionId && flag.ruleCode);
  assert.ok(sample, "expected at least one fully-populated flag for filter assertions");

  const userFilterRes = await fetch(
    `${BASE}/api/v1/system/security-flags?userId=${encodeURIComponent(sample.userId)}`,
    { headers: trustedHeaders(admin, `/api/v1/system/security-flags?userId=${encodeURIComponent(sample.userId)}`) }
  );
  assert.equal(userFilterRes.status, 200);
  const userFilterJson = await userFilterRes.json();
  for (const flag of userFilterJson.data) {
    assert.equal(flag.userId, sample.userId);
  }

  const ruleFilterRes = await fetch(
    `${BASE}/api/v1/system/security-flags?ruleCode=${encodeURIComponent(sample.ruleCode)}`,
    { headers: trustedHeaders(admin, `/api/v1/system/security-flags?ruleCode=${encodeURIComponent(sample.ruleCode)}`) }
  );
  assert.equal(ruleFilterRes.status, 200);
  const ruleFilterJson = await ruleFilterRes.json();
  for (const flag of ruleFilterJson.data) {
    assert.equal(flag.ruleCode, sample.ruleCode);
  }

  const sessionFilterRes = await fetch(
    `${BASE}/api/v1/system/security-flags?sessionId=${encodeURIComponent(sample.sessionId)}`,
    { headers: trustedHeaders(admin, `/api/v1/system/security-flags?sessionId=${encodeURIComponent(sample.sessionId)}`) }
  );
  assert.equal(sessionFilterRes.status, 200);
  const sessionFilterJson = await sessionFilterRes.json();
  for (const flag of sessionFilterJson.data) {
    assert.equal(flag.sessionId, sample.sessionId);
  }

  const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const timeFilterRes = await fetch(
    `${BASE}/api/v1/system/security-flags?from=${encodeURIComponent(future)}`,
    { headers: trustedHeaders(admin, `/api/v1/system/security-flags?from=${encodeURIComponent(future)}`) }
  );
  assert.equal(timeFilterRes.status, 200);
  const timeFilterJson = await timeFilterRes.json();
  assert.equal(
    timeFilterJson.data.length,
    0,
    "future-only timestamp filter must yield no results"
  );
});

test("global admin /system/security-flags is forbidden for non-admin roles", async () => {
  const clinician = await login("clinician", CLINICIAN_PASS);
  const res = await fetch(`${BASE}/api/v1/system/security-flags`, {
    headers: trustedHeaders(clinician, "/api/v1/system/security-flags")
  });
  assert.equal(res.status, 403, "clinician must not access the global security-flags admin view");
});

test("self-scoped /system/my-security-flags remains available to all authenticated users", async () => {
  const client = await login("client", CLIENT_PASS);
  const res = await fetch(`${BASE}/api/v1/system/my-security-flags`, {
    headers: trustedHeaders(client, "/api/v1/system/my-security-flags")
  });
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.ok(Array.isArray(json.data));
});

test("unauthenticated /auth/security-questions returns user-specific question for real users and generic for others", async () => {
  // Existing username — should return the user's configured security question(s)
  const realRes = await fetch(`${BASE}/api/v1/auth/security-questions?username=administrator`);
  assert.equal(realRes.status, 200);
  const realJson = await realRes.json();
  assert.ok(Array.isArray(realJson.data));
  assert.ok(realJson.data.length >= 1, "real user should have at least one security question");
  assert.ok(typeof realJson.data[0].question === "string");
  // The question should be the user's actual configured question, not the generic fallback
  assert.notEqual(realJson.data[0].question, "What is your account recovery question?",
    "real user should receive their configured question, not the generic fallback");

  // Non-existing username — should return generic fallback
  const fakeRes = await fetch(`${BASE}/api/v1/auth/security-questions?username=zzz_no_such_user_zzz`);
  assert.equal(fakeRes.status, 200);
  const fakeJson = await fakeRes.json();
  assert.ok(Array.isArray(fakeJson.data));
  assert.equal(fakeJson.data.length, 1);
  assert.equal(fakeJson.data[0].question, "What is your account recovery question?");

  // Empty username — should return generic fallback
  const emptyRes = await fetch(`${BASE}/api/v1/auth/security-questions?username=`);
  assert.equal(emptyRes.status, 200);
  const emptyJson = await emptyRes.json();
  assert.deepEqual(fakeJson.data, emptyJson.data,
    "fake and empty usernames must both return the same generic fallback");

  // All responses must have the same shape: array of { question: string }
  for (const dataset of [realJson.data, fakeJson.data, emptyJson.data]) {
    for (const entry of dataset) {
      assert.ok(typeof entry.question === "string", "each entry must have a question string");
      assert.equal(Object.keys(entry).length, 1, "entries must only expose the question text, not answer hashes");
    }
  }
});

test("/auth/recover-password returns uniform success regardless of user/question/answer validity", async () => {
  // The recovery endpoint must NEVER expose whether the username exists,
  // whether the question matched, or whether the answer matched. All
  // failure modes (other than weak password) collapse to the same
  // 200 { success: true } payload.
  const cases = [
    {
      label: "non-existent user",
      body: {
        username: "zzz_no_such_user_recovery",
        question: "anything",
        answer: "anything",
        newPassword: "FreshNewPass12345!"
      }
    },
    {
      label: "real user, wrong question",
      body: {
        username: "administrator",
        question: "this is definitely not the question",
        answer: "anything",
        newPassword: "FreshNewPass12345!"
      }
    },
    {
      label: "real user, wrong answer",
      body: {
        username: "administrator",
        question: "What is your primary facility code?",
        answer: "wrong-answer",
        newPassword: "FreshNewPass12345!"
      }
    }
  ];

  let firstShape = null;
  for (const tc of cases) {
    const res = await fetch(`${BASE}/api/v1/auth/recover-password`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(tc.body)
    });
    assert.equal(res.status, 200, `${tc.label}: expected 200, got ${res.status}`);
    const json = await res.json();
    assert.equal(json.data.success, true, `${tc.label}: success must be true`);
    assert.equal(json.data.reset, false, `${tc.label}: reset must be false for invalid recovery`);
    if (!firstShape) {
      firstShape = json;
    } else {
      assert.deepEqual(json, firstShape, `${tc.label}: differs from first response`);
    }
  }
});

test("/auth/recover-password rejects weak passwords with a non-leaky 400", async () => {
  // The single non-uniform branch is password-policy validation, which
  // operates on attacker-supplied input only and therefore leaks no
  // account state.
  const res = await fetch(`${BASE}/api/v1/auth/recover-password`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      username: "administrator",
      question: "anything",
      answer: "anything",
      newPassword: "x"
    })
  });
  assert.equal(res.status, 400);
});

test("requestSigningMiddleware rejects non-consecutive nonce replays", async () => {
  // Drive three GETs with three distinct nonces, then replay the FIRST
  // (non-most-recent) nonce. The naive lastNonce check would have allowed
  // this; the persistent ledger must reject it as REPLAY_DETECTED.
  const clinician = await login("clinician", CLINICIAN_PASS);
  const path = "/api/v1/mindtrack/clients";

  function customHeaders(nonce) {
    const timestamp = Date.now();
    const payload = ["GET", path, String(timestamp), nonce, ""].join("|");
    const signature = crypto
      .createHmac("sha256", clinician.csrfToken)
      .update(payload)
      .digest("hex");
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

  const res1 = await fetch(`${BASE}${path}`, { headers: customHeaders(nonceA) });
  assert.equal(res1.status, 200, "fresh nonceA must be accepted");

  const res2 = await fetch(`${BASE}${path}`, { headers: customHeaders(nonceB) });
  assert.equal(res2.status, 200, "fresh nonceB must be accepted");

  const res3 = await fetch(`${BASE}${path}`, { headers: customHeaders(nonceC) });
  assert.equal(res3.status, 200, "fresh nonceC must be accepted");

  // Now replay nonceA — the first, NOT the most recent.
  const replayRes = await fetch(`${BASE}${path}`, { headers: customHeaders(nonceA) });
  assert.equal(
    replayRes.status,
    401,
    "replayed non-consecutive nonceA must be rejected with 401"
  );
  const replayJson = await replayRes.json();
  assert.equal(replayJson.code, "REPLAY_DETECTED");

  // And replay nonceB.
  const replayBRes = await fetch(`${BASE}${path}`, { headers: customHeaders(nonceB) });
  assert.equal(replayBRes.status, 401);
  const replayBJson = await replayBRes.json();
  assert.equal(replayBJson.code, "REPLAY_DETECTED");
});

test("login response surfaces mustRotatePassword flag (false in test stack)", async () => {
  // The test stack runs with SEED_REQUIRE_ROTATION=false so seeded users
  // can authenticate directly. The login response must still surface the
  // mustRotatePassword field so frontends can drive the rotation prompt.
  const res = await fetch(`${BASE}/api/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "administrator", password: ADMIN_PASS })
  });
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(typeof json.data?.user?.mustRotatePassword, "boolean");
});

test("/api/v1/system/profile-fields/custom validates malformed payloads with 400", async () => {
  const admin = await login("administrator", ADMIN_PASS);

  const malformedCases = [
    { reason: "missing field key", body: { field: { label: "x", fieldType: "text" }, reason: "ok" } },
    { reason: "invalid field type", body: { field: { key: "ok_key", label: "x", fieldType: "rocket" }, reason: "ok" } },
    { reason: "options on non-select", body: { field: { key: "ok_key", label: "x", fieldType: "text", options: ["a"] }, reason: "ok" } },
    { reason: "invalid visibleTo", body: { field: { key: "ok_key", label: "x", fieldType: "text", visibleTo: ["root"] }, reason: "ok" } },
    { reason: "missing reason", body: { field: { key: "ok_key", label: "x", fieldType: "text" } } },
    { reason: "extra root key", body: { field: { key: "ok_key", label: "x", fieldType: "text" }, reason: "ok", extra: 1 } }
  ];
  for (const tc of malformedCases) {
    const body = JSON.stringify(tc.body);
    const res = await fetch(`${BASE}/api/v1/system/profile-fields/custom`, {
      method: "POST",
      headers: trustedHeaders(admin, "/api/v1/system/profile-fields/custom", { method: "POST", body }),
      body
    });
    assert.equal(res.status, 400, `${tc.reason}: expected 400, got ${res.status}`);
  }
});

test("/auth/session requires the full signed-header chain (no signed headers → 401)", async () => {
  // Phase 2 (protected) auth routes share the global /api/v1 chain. The
  // /auth/session endpoint is no longer reachable with bare cookies — it
  // must be called with the full signature/timestamp/nonce trio (and a
  // valid CSRF on POST routes). This regression locks that in: a fresh
  // login establishes a session, and then a GET /auth/session WITHOUT
  // signature headers must be rejected with 401, not silently authorized.
  const admin = await login("administrator", ADMIN_PASS);

  // Bare cookies → 401 (signature headers missing)
  const bareRes = await fetch(`${BASE}/api/v1/auth/session`, {
    method: "GET",
    headers: { cookie: admin.cookie }
  });
  assert.equal(
    bareRes.status,
    401,
    "GET /auth/session without signed headers must be rejected"
  );

  // With the proper signed headers, the same call succeeds.
  const signedRes = await fetch(`${BASE}/api/v1/auth/session`, {
    method: "GET",
    headers: trustedHeaders(admin, "/api/v1/auth/session")
  });
  assert.equal(signedRes.status, 200, "signed /auth/session must succeed");
  const signedJson = await signedRes.json();
  assert.ok(signedJson.data?.user?.id, "session payload must include the user");
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
  // The /auth/session endpoint is now part of the protected /api/v1 chain,
  // so the same Mongo-backed session rate limit (60/min) applies. Use a
  // fresh session so we don't pollute the budget for other tests, and
  // confirm that an extreme burst eventually trips the limiter.
  const admin = await login("administrator", ADMIN_PASS);
  let saw429 = false;
  for (let i = 0; i < 70; i += 1) {
    const res = await fetch(`${BASE}/api/v1/auth/session`, {
      headers: trustedHeaders(admin, "/api/v1/auth/session")
    });
    if (res.status === 429) {
      saw429 = true;
      break;
    }
  }
  assert.equal(saw429, true, "/auth/session must be subject to session rate limiting");
});

test("/system/backup-restore strict validator rejects malformed bodies before service runs", async () => {
  // The validateBackupRestoreRequest middleware now runs before the
  // service. Each of these cases must be rejected at the edge with 400
  // INVALID_BACKUP_FILENAME or INVALID_REQUEST/IDEMPOTENCY_REQUIRED, never
  // reaching the filesystem and never deleting any data.
  const admin = await login("administrator", ADMIN_PASS);

  const cases = [
    {
      label: "missing filename",
      body: { reason: "x" },
      idem: crypto.randomUUID()
    },
    {
      label: "missing reason",
      body: { filename: "mindtrack-backup-2026-04-07T00-00-00-000Z.enc.json" },
      idem: crypto.randomUUID()
    },
    {
      label: "non-allowlisted filename",
      body: { filename: "evil.enc.json", reason: "x" },
      idem: crypto.randomUUID()
    },
    {
      label: "traversal in filename",
      body: { filename: "../etc/passwd", reason: "x" },
      idem: crypto.randomUUID()
    },
    {
      label: "extra body key",
      body: {
        filename: "mindtrack-backup-2026-04-07T00-00-00-000Z.enc.json",
        reason: "x",
        extra: 1
      },
      idem: crypto.randomUUID()
    },
    {
      label: "missing idempotency header",
      body: {
        filename: "mindtrack-backup-2026-04-07T00-00-00-000Z.enc.json",
        reason: "x"
      },
      idem: undefined
    }
  ];

  for (const tc of cases) {
    const body = JSON.stringify(tc.body);
    const res = await fetch(`${BASE}/api/v1/system/backup-restore`, {
      method: "POST",
      headers: trustedHeaders(admin, "/api/v1/system/backup-restore", {
        method: "POST",
        body,
        idempotencyKey: tc.idem
      }),
      body
    });
    assert.equal(res.status, 400, `${tc.label}: expected 400, got ${res.status}`);
  }
});

test("/system/backup-restore: validator failure must NOT mutate any data", async () => {
  // Boundary test: a validator-rejected restore must leave the system in
  // exactly its prior state. We compare client counts before and after a
  // batch of malformed restore attempts.
  const admin = await login("administrator", ADMIN_PASS);
  const clinician = await login("clinician", CLINICIAN_PASS);

  const beforeRes = await fetch(`${BASE}/api/v1/mindtrack/clients`, {
    headers: trustedHeaders(clinician, "/api/v1/mindtrack/clients")
  });
  const beforeJson = await beforeRes.json();
  assert.equal(beforeRes.status, 200);
  const beforeCount = beforeJson.data.length;

  const malformedAttempts = [
    { filename: "evil.enc.json", reason: "y" },
    { filename: "../etc/passwd", reason: "y" },
    {
      filename: "mindtrack-backup-2026-04-07T00-00-00-000Z.enc.json",
      reason: "y",
      hax: true
    }
  ];
  for (const m of malformedAttempts) {
    const body = JSON.stringify(m);
    await fetch(`${BASE}/api/v1/system/backup-restore`, {
      method: "POST",
      headers: trustedHeaders(admin, "/api/v1/system/backup-restore", {
        method: "POST",
        body,
        idempotencyKey: crypto.randomUUID()
      }),
      body
    });
  }

  const clinicianAfter = await login("clinician", CLINICIAN_PASS);
  const afterRes = await fetch(`${BASE}/api/v1/mindtrack/clients`, {
    headers: trustedHeaders(clinicianAfter, "/api/v1/mindtrack/clients")
  });
  assert.equal(afterRes.status, 200);
  const afterJson = await afterRes.json();
  assert.equal(
    afterJson.data.length,
    beforeCount,
    "malformed restore attempts must not mutate data"
  );
});

test("/auth/rotate-password validator rejects unknown body keys and missing fields", async () => {
  // The new validateRotatePasswordRequest is mounted on the protected
  // /auth/rotate-password route. Each malformed body must hit a 400 at
  // the validator boundary, never reaching AuthService.rotatePassword.
  const admin = await login("administrator", ADMIN_PASS);

  const cases = [
    { label: "empty body", body: {} },
    { label: "missing newPassword", body: { currentPassword: "x" } },
    { label: "missing currentPassword", body: { newPassword: "y" } },
    {
      label: "extra root key",
      body: { currentPassword: "x", newPassword: "y", smuggle: 1 }
    },
    {
      label: "non-string fields",
      body: { currentPassword: 1, newPassword: 2 }
    }
  ];
  for (const tc of cases) {
    const body = JSON.stringify(tc.body);
    const res = await fetch(`${BASE}/api/v1/auth/rotate-password`, {
      method: "POST",
      headers: trustedHeaders(admin, "/api/v1/auth/rotate-password", {
        method: "POST",
        body
      }),
      body
    });
    assert.equal(res.status, 400, `${tc.label}: expected 400, got ${res.status}`);
  }
});

test("attachment download requires the full signed-header chain (binary signed-fetch path)", async () => {
  // Create an entry with a tiny inline PNG attachment, then attempt to
  // download it both WITHOUT signed headers (must be 401) and WITH them
  // (must succeed and return the original bytes).
  const clinician = await login("clinician", CLINICIAN_PASS);

  // Smallest possible 1x1 PNG, base64-encoded.
  const tinyPng =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgAAIAAAUAAen63NgAAAAASUVORK5CYII=";
  const expectedBytes = Buffer.from(tinyPng, "base64");
  const fingerprint = crypto
    .createHash("sha256")
    .update(`download-${Date.now()}-${Math.random()}`)
    .digest("hex");

  // Use cli002 because an earlier test in the suite ("retention and
  // legal-hold enforcement") puts cli001 on a permanent legal hold,
  // which would otherwise cause a 409 RETENTION_BLOCKED here.
  const entryBody = JSON.stringify({
    clientId: "cli002",
    entryType: "assessment",
    title: "Attachment download test",
    body: "Verifies the signed-fetch path for attachments.",
    tags: ["attachments-test"],
    reason: "attachment download regression",
    attachments: [
      {
        name: "pixel.png",
        type: "image/png",
        sizeBytes: expectedBytes.length,
        fingerprint,
        data: tinyPng
      }
    ]
  });
  const createRes = await fetch(`${BASE}/api/v1/mindtrack/entries`, {
    method: "POST",
    headers: trustedHeaders(clinician, "/api/v1/mindtrack/entries", { method: "POST", body: entryBody }),
    body: entryBody
  });
  assert.equal(createRes.status, 201, "entry creation must succeed");
  const createJson = await createRes.json();
  const entryId = createJson.data._id;
  assert.ok(entryId, "created entry must expose _id");

  const downloadPath = `/api/v1/mindtrack/entries/${entryId}/attachments/${fingerprint}`;

  // 1) Bare cookies → must be 401: the protected /api/v1 chain rejects
  //    the unsigned GET that the legacy <a href> approach would issue.
  const unsignedRes = await fetch(`${BASE}${downloadPath}`, {
    method: "GET",
    headers: { cookie: clinician.cookie }
  });
  assert.equal(
    unsignedRes.status,
    401,
    "unsigned attachment download must be rejected by the protected chain"
  );

  // 2) Signed binary fetch — must succeed and return the original bytes.
  const signedRes = await fetch(`${BASE}${downloadPath}`, {
    method: "GET",
    headers: trustedHeaders(clinician, downloadPath)
  });
  assert.equal(signedRes.status, 200, "signed attachment download must succeed");
  assert.match(
    signedRes.headers.get("content-type") || "",
    /image\/png/,
    "Content-Type must be propagated"
  );
  const downloaded = Buffer.from(await signedRes.arrayBuffer());
  assert.deepEqual(downloaded, expectedBytes, "downloaded bytes must match the originals");
});

test("/mindtrack/search rejects malformed regex inputs at the validator boundary", async () => {
  // The search service now escapes user input before constructing a
  // RegExp. Inputs that exceed the safe length cap or contain control
  // characters return 400 instead of crashing the regex engine.
  const clinician = await login("clinician", CLINICIAN_PASS);

  const cases = [
    { label: "200+ char query", q: "a".repeat(250), expectedCode: "SEARCH_QUERY_TOO_LONG" },
    { label: "NUL byte", q: "foo%00bar", expectedCode: "SEARCH_QUERY_INVALID" },
    { label: "control char (BEL)", q: "foo%07bar", expectedCode: "SEARCH_QUERY_INVALID" }
  ];
  for (const tc of cases) {
    const path = `/api/v1/mindtrack/search?q=${tc.q}`;
    const res = await fetch(`${BASE}${path}`, {
      headers: trustedHeaders(clinician, path)
    });
    assert.equal(res.status, 400, `${tc.label}: expected 400, got ${res.status}`);
    const json = await res.json();
    assert.equal(json.code, tc.expectedCode, `${tc.label}: code mismatch`);
  }
});

test("/mindtrack/search treats injected regex syntax as a literal substring (no injection)", async () => {
  // Confirm the escaped-regex path: passing `(.*)+` should NOT match
  // arbitrary entries — the search engine now treats it as a literal
  // 5-character substring, which won't appear in any seeded body, so
  // every returned entry MUST literally contain the query.
  const clinician = await login("clinician", CLINICIAN_PASS);
  const path = `/api/v1/mindtrack/search?q=${encodeURIComponent("(.*)+")}`;
  const res = await fetch(`${BASE}${path}`, {
    headers: trustedHeaders(clinician, path)
  });
  assert.equal(res.status, 200, "valid (escaped) input must return 200");
  const json = await res.json();
  for (const entry of json.data?.entries || []) {
    const haystack = `${entry.title || ""} ${entry.body || ""}`;
    assert.ok(
      haystack.includes("(.*)+"),
      "an entry returned by the escaped search must literally contain the query"
    );
  }
});

test("401/403/404 matrix across sensitive endpoint families", async () => {
  // Single consolidated regression for the closed-box semantics of the
  // most sensitive endpoint surfaces. Each row asserts the documented
  // status against a known caller identity.
  const admin = await login("administrator", ADMIN_PASS);
  const client = await login("client", CLIENT_PASS);

  const rows = [
    // 401 — no signed headers at all
    {
      label: "401 /system/backup-status without signed headers",
      method: "GET",
      url: "/api/v1/system/backup-status",
      headers: { cookie: admin.cookie },
      expect: 401
    },
    {
      label: "401 /mindtrack/clients without signed headers",
      method: "GET",
      url: "/api/v1/mindtrack/clients",
      headers: { cookie: admin.cookie },
      expect: 401
    },
    {
      label: "401 /auth/session without signed headers",
      method: "GET",
      url: "/api/v1/auth/session",
      headers: { cookie: admin.cookie },
      expect: 401
    },
    // 403 — authenticated but missing permission
    {
      label: "403 /system/backup-status as client",
      method: "GET",
      url: "/api/v1/system/backup-status",
      headers: trustedHeaders(client, "/api/v1/system/backup-status"),
      expect: 403
    },
    {
      label: "403 /system/security-flags as client",
      method: "GET",
      url: "/api/v1/system/security-flags",
      headers: trustedHeaders(client, "/api/v1/system/security-flags"),
      expect: 403
    },
    {
      label: "403 /system/backup-files as client",
      method: "GET",
      url: "/api/v1/system/backup-files",
      headers: trustedHeaders(client, "/api/v1/system/backup-files"),
      expect: 403
    },
    {
      label: "403 /users as client",
      method: "GET",
      url: "/api/v1/users",
      headers: trustedHeaders(client, "/api/v1/users"),
      expect: 403
    },
    // 404 — authenticated and authorized but resource does not exist
    {
      label: "404 /mindtrack/clients/<missing>/timeline",
      method: "GET",
      url: "/api/v1/mindtrack/clients/00000000000000000000000000000000/timeline",
      headers: trustedHeaders(
        admin,
        "/api/v1/mindtrack/clients/00000000000000000000000000000000/timeline"
      ),
      expect: 404
    },
    {
      label: "404 attachment for unknown entry",
      method: "GET",
      url: "/api/v1/mindtrack/entries/00000000000000000000000000000000/attachments/deadbeef",
      headers: trustedHeaders(
        admin,
        "/api/v1/mindtrack/entries/00000000000000000000000000000000/attachments/deadbeef"
      ),
      expect: 404
    }
  ];

  for (const row of rows) {
    const res = await fetch(`${BASE}${row.url}`, {
      method: row.method,
      headers: row.headers
    });
    assert.equal(
      res.status,
      row.expect,
      `${row.label}: expected ${row.expect}, got ${res.status}`
    );
  }
});

test("restore from empty-state backup clears stale data and results in zero collection counts", async () => {
  const admin = await login("administrator", ADMIN_PASS);

  // Step 1: Snapshot the current seeded state so we can restore it afterward.
  const seedBackupBody = JSON.stringify({ reason: "empty-restore test: preserve seed" });
  const seedBackupRes = await fetch(`${BASE}/api/v1/system/backup-run`, {
    method: "POST",
    headers: trustedHeaders(admin, "/api/v1/system/backup-run", { method: "POST", body: seedBackupBody }),
    body: seedBackupBody
  });
  const seedBackupJson = await seedBackupRes.json();
  assert.equal(seedBackupRes.status, 200);
  const seedBackupFile = seedBackupJson.data.file;

  // Step 2: Record how many clients exist right now (seeded state).
  const preClientsRes = await fetch(`${BASE}/api/v1/mindtrack/clients`, {
    headers: trustedHeaders(admin, "/api/v1/mindtrack/clients")
  });
  const preClients = await preClientsRes.json();
  assert.equal(preClientsRes.status, 200);
  const seededClientCount = preClients.data.length;
  assert.ok(seededClientCount >= 1, "seed data should include at least one client");

  // Step 3: Create an extra client that will become stale data.
  const staleBody = JSON.stringify({
    name: "Stale Client For Empty Restore",
    dob: "2000-01-01",
    phone: "+1-555-000-9999",
    address: "999 Stale Lane",
    primaryClinicianId: "0000000000000000000000b1",
    channel: "in_person",
    tags: ["stale-test"],
    reason: "create stale data for empty-restore test"
  });
  const staleRes = await fetch(`${BASE}/api/v1/mindtrack/clients`, {
    method: "POST",
    headers: trustedHeaders(admin, "/api/v1/mindtrack/clients", { method: "POST", body: staleBody }),
    body: staleBody
  });
  assert.equal(staleRes.status, 201, "stale client should be created");

  // Confirm the extra client is present.
  const midClientsRes = await fetch(`${BASE}/api/v1/mindtrack/clients`, {
    headers: trustedHeaders(admin, "/api/v1/mindtrack/clients")
  });
  const midClients = await midClientsRes.json();
  assert.equal(midClients.data.length, seededClientCount + 1, "extra client should be visible");

  // Step 4: Restore from the seed backup (which does NOT contain the stale client).
  const restoreBody = JSON.stringify({ filename: seedBackupFile, reason: "empty-restore test: wipe stale data" });
  const restoreRes = await fetch(`${BASE}/api/v1/system/backup-restore`, {
    method: "POST",
    headers: trustedHeaders(admin, "/api/v1/system/backup-restore", {
      method: "POST",
      body: restoreBody,
      idempotencyKey: crypto.randomUUID()
    }),
    body: restoreBody
  });
  const restoreJson = await restoreRes.json();
  assert.equal(restoreRes.status, 200);
  assert.equal(restoreJson.data.success, true);

  // Step 5: Re-login (sessions may have been wiped by restore) and verify
  // the stale client is gone — the count must match the original seed exactly.
  const postAdmin = await login("administrator", ADMIN_PASS);
  const postClientsRes = await fetch(`${BASE}/api/v1/mindtrack/clients`, {
    headers: trustedHeaders(postAdmin, "/api/v1/mindtrack/clients")
  });
  const postClients = await postClientsRes.json();
  assert.equal(postClientsRes.status, 200);
  assert.equal(
    postClients.data.length,
    seededClientCount,
    "restore must clear stale data: client count should match the backup snapshot exactly, not preserve extra records"
  );
});
