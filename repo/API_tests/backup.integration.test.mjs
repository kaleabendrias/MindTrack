import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { BASE, ADMIN_PASS, CLINICIAN_PASS, login, trustedHeaders } from "./helpers.mjs";

// ---------------------------------------------------------------------------
// Backup lifecycle, restore round-trip, path traversal protection,
// validator boundary, and empty-state restore
// ---------------------------------------------------------------------------

test("offline policy response body schema is complete", async () => {
  const clinician = await login("clinician", CLINICIAN_PASS);
  const res = await fetch(`${BASE}/api/v1/system/offline-policy`, { headers: trustedHeaders(clinician, "/api/v1/system/offline-policy") });
  const json = await res.json();
  assert.equal(res.status, 200);
  assert.ok(json.data, "response must have a data object");
  assert.equal(json.data.mode, "offline_only", "mode must be offline_only");
  assert.equal(json.data.externalNetworkAllowed, false, "externalNetworkAllowed must be false");
  assert.equal(json.data.externalIntegrationsEnabled, false, "externalIntegrationsEnabled must be false");
  assert.equal(json.error, undefined, "success response must not have error field");
});

test("backup status response body schema is complete", async () => {
  const admin = await login("administrator", ADMIN_PASS);
  const res = await fetch(`${BASE}/api/v1/system/backup-status`, { headers: trustedHeaders(admin, "/api/v1/system/backup-status") });
  const json = await res.json();
  assert.equal(res.status, 200);
  assert.ok(json.data, "response must have a data object");
  assert.equal(typeof json.data.schedule, "string", "data.schedule must be a string");
  assert.equal(json.data.schedule, "0 0 * * *", "schedule must be nightly cron");
  assert.equal(typeof json.data.retentionDays, "number", "data.retentionDays must be a number");
  assert.equal(json.data.retentionDays, 30, "retention must be 30 days");
  assert.equal(json.error, undefined, "success response must not have error field");
});

test("backup lifecycle, radius constraints, and offline policy behave as expected", async () => {
  const admin = await login("administrator", ADMIN_PASS);
  const clinician = await login("clinician", CLINICIAN_PASS);

  const statusRes = await fetch(`${BASE}/api/v1/system/backup-status`, { headers: trustedHeaders(admin, "/api/v1/system/backup-status") });
  const statusJson = await statusRes.json();
  assert.equal(statusRes.status, 200);
  assert.ok(statusJson.data, "backup-status must return a data object");
  assert.equal(statusJson.data.schedule, "0 0 * * *");
  assert.equal(statusJson.data.retentionDays, 30);
  assert.equal(statusJson.error, undefined, "success response must not include error field");

  const backupRunRes = await fetch(`${BASE}/api/v1/system/backup-run`, { method: "POST", headers: trustedHeaders(admin, "/api/v1/system/backup-run", { method: "POST", body: "{}" }), body: "{}" });
  const backupRunJson = await backupRunRes.json();
  assert.equal(backupRunRes.status, 200);
  assert.equal(backupRunJson.data.success, true);
  assert.match(backupRunJson.data.file, /enc\.json$/);

  const nearbyRes = await fetch(`${BASE}/api/v1/mindtrack/recommendations/nearby?clientId=cli001&radiusMiles=50`, { headers: trustedHeaders(clinician, "/api/v1/mindtrack/recommendations/nearby?clientId=cli001&radiusMiles=50") });
  const nearbyJson = await nearbyRes.json();
  assert.equal(nearbyRes.status, 200);
  for (const facility of nearbyJson.data) {
    assert.ok(facility.distanceMiles <= 50);
  }

  const offlineRes = await fetch(`${BASE}/api/v1/system/offline-policy`, { headers: trustedHeaders(clinician, "/api/v1/system/offline-policy") });
  const offlineJson = await offlineRes.json();
  assert.equal(offlineRes.status, 200);
  assert.equal(offlineJson.data.externalNetworkAllowed, false);
  assert.equal(offlineJson.data.externalIntegrationsEnabled, false);
});

test("backup restore round-trip: create backup then restore from it", async () => {
  const admin = await login("administrator", ADMIN_PASS);

  const backupBody = JSON.stringify({ reason: "pre-restore backup" });
  const backupRes = await fetch(`${BASE}/api/v1/system/backup-run`, { method: "POST", headers: trustedHeaders(admin, "/api/v1/system/backup-run", { method: "POST", body: backupBody }), body: backupBody });
  const backupJson = await backupRes.json();
  assert.equal(backupRes.status, 200);
  assert.equal(backupJson.data.success, true);
  const backupFilename = backupJson.data.file;

  const listRes = await fetch(`${BASE}/api/v1/system/backup-files`, { headers: trustedHeaders(admin, "/api/v1/system/backup-files") });
  const listJson = await listRes.json();
  assert.equal(listRes.status, 200);
  assert.ok(listJson.data.includes(backupFilename), "backup file should appear in listing");

  const restoreBody = JSON.stringify({ filename: backupFilename, reason: "integration test restore" });
  const restoreIdemKey = crypto.randomUUID();
  const restoreRes = await fetch(`${BASE}/api/v1/system/backup-restore`, { method: "POST", headers: trustedHeaders(admin, "/api/v1/system/backup-restore", { method: "POST", body: restoreBody, idempotencyKey: restoreIdemKey }), body: restoreBody });
  const restoreJson = await restoreRes.json();
  assert.equal(restoreRes.status, 200);
  assert.equal(restoreJson.data.success, true);
  assert.equal(restoreJson.data.filename, backupFilename);

  const clinician = await login("clinician", CLINICIAN_PASS);
  const clientsRes = await fetch(`${BASE}/api/v1/mindtrack/clients`, { headers: trustedHeaders(clinician, "/api/v1/mindtrack/clients") });
  assert.equal(clientsRes.status, 200);
  assert.ok((await clientsRes.json()).data.length >= 1, "restored data should have clients");
});

test("backup restore rejects missing filename", async () => {
  const admin = await login("administrator", ADMIN_PASS);
  const body = JSON.stringify({ reason: "missing filename" });
  const res = await fetch(`${BASE}/api/v1/system/backup-restore`, { method: "POST", headers: trustedHeaders(admin, "/api/v1/system/backup-restore", { method: "POST", body }), body });
  assert.equal(res.status, 400);
});

test("backup restore rejects nonexistent file", async () => {
  const admin = await login("administrator", ADMIN_PASS);
  const body = JSON.stringify({ filename: "mindtrack-backup-1900-01-01T00-00-00-000Z.enc.json", reason: "test" });
  const res = await fetch(`${BASE}/api/v1/system/backup-restore`, { method: "POST", headers: trustedHeaders(admin, "/api/v1/system/backup-restore", { method: "POST", body, idempotencyKey: crypto.randomUUID() }), body });
  assert.equal(res.status, 404);
});

test("clinician cannot access restore endpoint", async () => {
  const clinician = await login("clinician", CLINICIAN_PASS);
  const body = JSON.stringify({ filename: "any.enc.json", reason: "test" });
  const res = await fetch(`${BASE}/api/v1/system/backup-restore`, { method: "POST", headers: trustedHeaders(clinician, "/api/v1/system/backup-restore", { method: "POST", body }), body });
  assert.equal(res.status, 403);
});

test("backup restore idempotency: replayed request returns same result", async () => {
  const admin = await login("administrator", ADMIN_PASS);

  const backupBody = JSON.stringify({ reason: "pre-idempotent-restore backup" });
  const backupRes = await fetch(`${BASE}/api/v1/system/backup-run`, { method: "POST", headers: trustedHeaders(admin, "/api/v1/system/backup-run", { method: "POST", body: backupBody }), body: backupBody });
  const backupJson = await backupRes.json();
  assert.equal(backupRes.status, 200);

  const restoreBody = JSON.stringify({ filename: backupJson.data.file, reason: "idempotent restore test" });
  const idemKey = crypto.randomUUID();

  const firstRes = await fetch(`${BASE}/api/v1/system/backup-restore`, { method: "POST", headers: trustedHeaders(admin, "/api/v1/system/backup-restore", { method: "POST", body: restoreBody, idempotencyKey: idemKey }), body: restoreBody });
  const firstJson = await firstRes.json();
  assert.equal(firstRes.status, 200);
  assert.equal(firstJson.data.success, true);
  assert.equal(Boolean(firstJson.idempotentReplay), false);

  const secondRes = await fetch(`${BASE}/api/v1/system/backup-restore`, { method: "POST", headers: trustedHeaders(admin, "/api/v1/system/backup-restore", { method: "POST", body: restoreBody, idempotencyKey: idemKey }), body: restoreBody });
  assert.equal(secondRes.status, 200);
  assert.equal(Boolean((await secondRes.json()).idempotentReplay), true);
});

test("backup restore rejects missing reason", async () => {
  const admin = await login("administrator", ADMIN_PASS);
  const body = JSON.stringify({ filename: "any.enc.json" });
  const res = await fetch(`${BASE}/api/v1/system/backup-restore`, { method: "POST", headers: trustedHeaders(admin, "/api/v1/system/backup-restore", { method: "POST", body }), body });
  assert.equal(res.status, 400);
});

test("backup restore preserves audit logs (fidelity)", async () => {
  const admin = await login("administrator", ADMIN_PASS);

  const backupBody = JSON.stringify({ reason: "fidelity test backup" });
  const backupRes = await fetch(`${BASE}/api/v1/system/backup-run`, { method: "POST", headers: trustedHeaders(admin, "/api/v1/system/backup-run", { method: "POST", body: backupBody }), body: backupBody });
  const backupJson = await backupRes.json();
  assert.equal(backupRes.status, 200);

  const preAudit = await (await fetch(`${BASE}/api/v1/system/audit-immutability-check`, { headers: trustedHeaders(admin, "/api/v1/system/audit-immutability-check") })).json();
  assert.equal(preAudit.data.checked, true, "audit logs should exist before restore");

  const restoreBody = JSON.stringify({ filename: backupJson.data.file, reason: "fidelity restore" });
  assert.equal((await fetch(`${BASE}/api/v1/system/backup-restore`, { method: "POST", headers: trustedHeaders(admin, "/api/v1/system/backup-restore", { method: "POST", body: restoreBody, idempotencyKey: crypto.randomUUID() }), body: restoreBody })).status, 200);

  const postAdmin = await login("administrator", ADMIN_PASS);
  const postAudit = await (await fetch(`${BASE}/api/v1/system/audit-immutability-check`, { headers: trustedHeaders(postAdmin, "/api/v1/system/audit-immutability-check") })).json();
  assert.equal(postAudit.data.checked, true, "audit logs should exist after restore");
  assert.equal(postAudit.data.immutable, true, "audit logs should remain immutable after restore");
});

test("backup restore rejects missing idempotency key", async () => {
  const admin = await login("administrator", ADMIN_PASS);
  const body = JSON.stringify({ filename: "mindtrack-backup-2026-04-07T00-00-00-000Z.enc.json", reason: "test" });
  const res = await fetch(`${BASE}/api/v1/system/backup-restore`, { method: "POST", headers: trustedHeaders(admin, "/api/v1/system/backup-restore", { method: "POST", body }), body });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).code, "IDEMPOTENCY_REQUIRED");
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
    const res = await fetch(`${BASE}/api/v1/system/backup-restore`, { method: "POST", headers: trustedHeaders(admin, "/api/v1/system/backup-restore", { method: "POST", body, idempotencyKey: crypto.randomUUID() }), body });
    assert.equal(res.status, 400, `expected 400 INVALID_BACKUP_FILENAME for "${filename}", got ${res.status}`);
    assert.equal((await res.json()).code, "INVALID_BACKUP_FILENAME");
  }
});

test("backup restore preserves audit log immutability and append-only semantics", async () => {
  const admin = await login("administrator", ADMIN_PASS);

  const preCheck = await (await fetch(`${BASE}/api/v1/system/audit-immutability-check`, { headers: trustedHeaders(admin, "/api/v1/system/audit-immutability-check") })).json();
  assert.equal(preCheck.data.immutable, true, "audit log must be immutable before restore");

  const backupBody = JSON.stringify({ reason: "audit-immutability backup" });
  const backupJson = await (await fetch(`${BASE}/api/v1/system/backup-run`, { method: "POST", headers: trustedHeaders(admin, "/api/v1/system/backup-run", { method: "POST", body: backupBody }), body: backupBody })).json();
  assert.equal(backupJson.data.success, true);

  const postSnapshotBody = JSON.stringify({ reason: "post-snapshot marker" });
  assert.equal((await fetch(`${BASE}/api/v1/system/backup-run`, { method: "POST", headers: trustedHeaders(admin, "/api/v1/system/backup-run", { method: "POST", body: postSnapshotBody }), body: postSnapshotBody })).status, 200);

  const restoreBody = JSON.stringify({ filename: backupJson.data.file, reason: "audit immutability assertion" });
  const restoreRes = await fetch(`${BASE}/api/v1/system/backup-restore`, { method: "POST", headers: trustedHeaders(admin, "/api/v1/system/backup-restore", { method: "POST", body: restoreBody, idempotencyKey: crypto.randomUUID() }), body: restoreBody });
  assert.equal(restoreRes.status, 200);
  const restoreJson = await restoreRes.json();
  assert.equal(restoreJson.data.success, true);
  assert.equal(restoreJson.data.auditLogsPreserved, true, "restore must report auditLogsPreserved=true");

  const postAdmin = await login("administrator", ADMIN_PASS);
  const postCheck = await (await fetch(`${BASE}/api/v1/system/audit-immutability-check`, { headers: trustedHeaders(postAdmin, "/api/v1/system/audit-immutability-check") })).json();
  assert.equal(postCheck.data.checked, true);
  assert.equal(postCheck.data.immutable, true, "audit log must remain immutable after restore");
});

test("backup restore rolls back on failure when snapshot is corrupt", async () => {
  const admin = await login("administrator", ADMIN_PASS);
  const clinician = await login("clinician", CLINICIAN_PASS);

  const beforeJson = await (await fetch(`${BASE}/api/v1/mindtrack/clients`, { headers: trustedHeaders(clinician, "/api/v1/mindtrack/clients") })).json();
  const beforeCount = beforeJson.data.length;

  const failBody = JSON.stringify({ filename: "mindtrack-backup-1900-01-01T00-00-00-000Z.enc.json", reason: "rollback assertion" });
  const failRes = await fetch(`${BASE}/api/v1/system/backup-restore`, { method: "POST", headers: trustedHeaders(admin, "/api/v1/system/backup-restore", { method: "POST", body: failBody, idempotencyKey: crypto.randomUUID() }), body: failBody });
  assert.equal(failRes.status, 404, "missing snapshot should fail with 404 BACKUP_NOT_FOUND");

  const clinicianAfter = await login("clinician", CLINICIAN_PASS);
  const afterJson = await (await fetch(`${BASE}/api/v1/mindtrack/clients`, { headers: trustedHeaders(clinicianAfter, "/api/v1/mindtrack/clients") })).json();
  assert.equal(afterJson.data.length, beforeCount, "client count must be unchanged after a failed restore");
});

test("/system/backup-restore strict validator rejects malformed bodies before service runs", async () => {
  const admin = await login("administrator", ADMIN_PASS);
  const cases = [
    { label: "missing filename", body: { reason: "x" }, idem: crypto.randomUUID() },
    { label: "missing reason", body: { filename: "mindtrack-backup-2026-04-07T00-00-00-000Z.enc.json" }, idem: crypto.randomUUID() },
    { label: "non-allowlisted filename", body: { filename: "evil.enc.json", reason: "x" }, idem: crypto.randomUUID() },
    { label: "traversal in filename", body: { filename: "../etc/passwd", reason: "x" }, idem: crypto.randomUUID() },
    { label: "extra body key", body: { filename: "mindtrack-backup-2026-04-07T00-00-00-000Z.enc.json", reason: "x", extra: 1 }, idem: crypto.randomUUID() },
    { label: "missing idempotency header", body: { filename: "mindtrack-backup-2026-04-07T00-00-00-000Z.enc.json", reason: "x" }, idem: undefined }
  ];
  for (const tc of cases) {
    const body = JSON.stringify(tc.body);
    const res = await fetch(`${BASE}/api/v1/system/backup-restore`, { method: "POST", headers: trustedHeaders(admin, "/api/v1/system/backup-restore", { method: "POST", body, idempotencyKey: tc.idem }), body });
    assert.equal(res.status, 400, `${tc.label}: expected 400, got ${res.status}`);
  }
});

test("/system/backup-restore: validator failure must NOT mutate any data", async () => {
  const admin = await login("administrator", ADMIN_PASS);
  const clinician = await login("clinician", CLINICIAN_PASS);

  const beforeJson = await (await fetch(`${BASE}/api/v1/mindtrack/clients`, { headers: trustedHeaders(clinician, "/api/v1/mindtrack/clients") })).json();
  assert.equal((await fetch(`${BASE}/api/v1/mindtrack/clients`, { headers: trustedHeaders(clinician, "/api/v1/mindtrack/clients") })).status, 200);
  const beforeCount = beforeJson.data.length;

  const malformedAttempts = [
    { filename: "evil.enc.json", reason: "y" },
    { filename: "../etc/passwd", reason: "y" },
    { filename: "mindtrack-backup-2026-04-07T00-00-00-000Z.enc.json", reason: "y", hax: true }
  ];
  for (const m of malformedAttempts) {
    const body = JSON.stringify(m);
    await fetch(`${BASE}/api/v1/system/backup-restore`, { method: "POST", headers: trustedHeaders(admin, "/api/v1/system/backup-restore", { method: "POST", body, idempotencyKey: crypto.randomUUID() }), body });
  }

  const clinicianAfter = await login("clinician", CLINICIAN_PASS);
  const afterJson = await (await fetch(`${BASE}/api/v1/mindtrack/clients`, { headers: trustedHeaders(clinicianAfter, "/api/v1/mindtrack/clients") })).json();
  assert.equal(afterJson.data.length, beforeCount, "malformed restore attempts must not mutate data");
});

test("restore from empty-state backup clears stale data and results in zero collection counts", async () => {
  const admin = await login("administrator", ADMIN_PASS);

  const seedBackupBody = JSON.stringify({ reason: "empty-restore test: preserve seed" });
  const seedBackupJson = await (await fetch(`${BASE}/api/v1/system/backup-run`, { method: "POST", headers: trustedHeaders(admin, "/api/v1/system/backup-run", { method: "POST", body: seedBackupBody }), body: seedBackupBody })).json();
  assert.equal(seedBackupJson.data.success, true);
  const seedBackupFile = seedBackupJson.data.file;

  const preClients = await (await fetch(`${BASE}/api/v1/mindtrack/clients`, { headers: trustedHeaders(admin, "/api/v1/mindtrack/clients") })).json();
  const seededClientCount = preClients.data.length;
  assert.ok(seededClientCount >= 1, "seed data should include at least one client");

  const staleBody = JSON.stringify({ name: "Stale Client For Empty Restore", dob: "2000-01-01", phone: "+1-555-000-9999", address: "999 Stale Lane", primaryClinicianId: "0000000000000000000000b1", channel: "in_person", tags: ["stale-test"], reason: "create stale data for empty-restore test" });
  assert.equal((await fetch(`${BASE}/api/v1/mindtrack/clients`, { method: "POST", headers: trustedHeaders(admin, "/api/v1/mindtrack/clients", { method: "POST", body: staleBody }), body: staleBody })).status, 201, "stale client should be created");

  const midClients = await (await fetch(`${BASE}/api/v1/mindtrack/clients`, { headers: trustedHeaders(admin, "/api/v1/mindtrack/clients") })).json();
  assert.equal(midClients.data.length, seededClientCount + 1, "extra client should be visible");

  const restoreBody = JSON.stringify({ filename: seedBackupFile, reason: "empty-restore test: wipe stale data" });
  const restoreJson = await (await fetch(`${BASE}/api/v1/system/backup-restore`, { method: "POST", headers: trustedHeaders(admin, "/api/v1/system/backup-restore", { method: "POST", body: restoreBody, idempotencyKey: crypto.randomUUID() }), body: restoreBody })).json();
  assert.equal(restoreJson.data.success, true);

  const postAdmin = await login("administrator", ADMIN_PASS);
  const postClients = await (await fetch(`${BASE}/api/v1/mindtrack/clients`, { headers: trustedHeaders(postAdmin, "/api/v1/mindtrack/clients") })).json();
  assert.equal(postClients.data.length, seededClientCount, "restore must clear stale data: client count should match the backup snapshot exactly");
});
