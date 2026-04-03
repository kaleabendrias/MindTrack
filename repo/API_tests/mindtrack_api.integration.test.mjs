import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

const BASE = process.env.BACKEND_BASE_URL || "http://127.0.0.1:4000";

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
    csrfToken: json.data?.csrfToken,
    requestSigningKey: json.data?.requestSigningKey
  };
}

test("trusted mutating request enforcement blocks missing csrf/nonce", async () => {
  const clinician = await login("clinician", "ClinicianPass2026");
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
  const clinician = await login("clinician", "ClinicianPass2026");
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
  const clinician = await login("clinician", "ClinicianPass2026");

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
  const clinician = await login("clinician", "ClinicianPass2026");
  const admin = await login("administrator", "AdminPasscode2026");
  const client = await login("client", "ClientPasscode2026");

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
  const admin = await login("administrator", "AdminPasscode2026");

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
  const admin = await login("administrator", "AdminPasscode2026");

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
  const admin = await login("administrator", "AdminPasscode2026");
  const clinician = await login("clinician", "ClinicianPass2026");

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
  const admin = await login("administrator", "AdminPasscode2026");
  const clinician = await login("clinician", "ClinicianPass2026");

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
  const admin = await login("administrator", "AdminPasscode2026");
  const clinician = await login("clinician", "ClinicianPass2026");

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
  const client = await login("client", "ClientPasscode2026");
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

test("backup restore round-trip: create backup then restore from it", async () => {
  const admin = await login("administrator", "AdminPasscode2026");

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
  const restoreRes = await fetch(`${BASE}/api/v1/system/backup-restore`, {
    method: "POST",
    headers: trustedHeaders(admin, "/api/v1/system/backup-restore", { method: "POST", body: restoreBody }),
    body: restoreBody
  });
  const restoreJson = await restoreRes.json();
  assert.equal(restoreRes.status, 200);
  assert.equal(restoreJson.data.success, true);
  assert.equal(restoreJson.data.filename, backupFilename);

  const clinician = await login("clinician", "ClinicianPass2026");
  const clientsRes = await fetch(`${BASE}/api/v1/mindtrack/clients`, {
    headers: trustedHeaders(clinician, "/api/v1/mindtrack/clients")
  });
  assert.equal(clientsRes.status, 200);
  const clientsJson = await clientsRes.json();
  assert.ok(clientsJson.data.length >= 1, "restored data should have clients");
});

test("backup restore rejects missing filename", async () => {
  const admin = await login("administrator", "AdminPasscode2026");
  const body = JSON.stringify({ reason: "missing filename" });
  const res = await fetch(`${BASE}/api/v1/system/backup-restore`, {
    method: "POST",
    headers: trustedHeaders(admin, "/api/v1/system/backup-restore", { method: "POST", body }),
    body
  });
  assert.equal(res.status, 400);
});

test("backup restore rejects nonexistent file", async () => {
  const admin = await login("administrator", "AdminPasscode2026");
  const body = JSON.stringify({ filename: "nonexistent.enc.json", reason: "test" });
  const res = await fetch(`${BASE}/api/v1/system/backup-restore`, {
    method: "POST",
    headers: trustedHeaders(admin, "/api/v1/system/backup-restore", { method: "POST", body }),
    body
  });
  assert.equal(res.status, 404);
});

test("clinician cannot access restore endpoint", async () => {
  const clinician = await login("clinician", "ClinicianPass2026");
  const body = JSON.stringify({ filename: "any.enc.json", reason: "test" });
  const res = await fetch(`${BASE}/api/v1/system/backup-restore`, {
    method: "POST",
    headers: trustedHeaders(clinician, "/api/v1/system/backup-restore", { method: "POST", body }),
    body
  });
  assert.equal(res.status, 403);
});

test("backup restore idempotency: replayed request returns same result", async () => {
  const admin = await login("administrator", "AdminPasscode2026");

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
  const admin = await login("administrator", "AdminPasscode2026");
  const body = JSON.stringify({ filename: "any.enc.json" });
  const res = await fetch(`${BASE}/api/v1/system/backup-restore`, {
    method: "POST",
    headers: trustedHeaders(admin, "/api/v1/system/backup-restore", { method: "POST", body }),
    body
  });
  assert.equal(res.status, 400);
});

test("clinician search returns all entries for assigned clients regardless of entry author", async () => {
  const admin = await login("administrator", "AdminPasscode2026");
  const clinician = await login("clinician", "ClinicianPass2026");

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
  const clinician = await login("clinician", "ClinicianPass2026");
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

  const admin = await login("administrator", "AdminPasscode2026");
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
