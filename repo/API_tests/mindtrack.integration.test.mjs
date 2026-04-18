import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { BASE, ADMIN_PASS, CLINICIAN_PASS, CLIENT_PASS, login, trustedHeaders } from "./helpers.mjs";

// ---------------------------------------------------------------------------
// MindTrack: clients, entries, search, governance, attachments
// ---------------------------------------------------------------------------

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
  assert.ok(selfContext.data, "self-context must return a data object");
  assert.ok(selfContext.data.client, "self-context data must include a client object");
  assert.equal(selfContext.data.client._id, "cli001");
  assert.ok(typeof selfContext.data.client.name === "string", "self-context client must have a name string");
  assert.ok(Array.isArray(selfContext.data.timeline), "self-context must include a timeline array");
  assert.equal(selfContext.error, undefined, "success response must not include error field");

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

test("client list response body schema has correct shape", async () => {
  const admin = await login("administrator", ADMIN_PASS);
  const res = await fetch(`${BASE}/api/v1/mindtrack/clients`, {
    headers: trustedHeaders(admin, "/api/v1/mindtrack/clients")
  });
  const json = await res.json();
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(json.data), "data must be an array");
  assert.equal(json.error, undefined, "success response must not have error field");
  if (json.data.length > 0) {
    const client = json.data[0];
    assert.ok(typeof client._id === "string", "client must have _id string");
    assert.ok(typeof client.name === "string", "client must have name string");
  }
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
    { headers: trustedHeaders(clinician, "/api/v1/mindtrack/search?q=template&channel=assessment&sort=relevance") }
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
    { headers: trustedHeaders(client, "/api/v1/mindtrack/search?q=template&channel=assessment&sort=relevance") }
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
    assert.notEqual(entry.entryType, "counseling_note", "client search must never return counseling_note entries");
  }

  const broadRes = await fetch(
    `${BASE}/api/v1/mindtrack/search?q=session&sort=relevance`,
    { headers: trustedHeaders(client, "/api/v1/mindtrack/search?q=session&sort=relevance") }
  );
  const broadJson = await broadRes.json();
  assert.equal(broadRes.status, 200);
  for (const entry of broadJson.data.entries) {
    assert.notEqual(entry.entryType, "counseling_note", "client broad search must never return counseling_note entries");
  }
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

test("attachment download requires the full signed-header chain (binary signed-fetch path)", async () => {
  const clinician = await login("clinician", CLINICIAN_PASS);

  const tinyPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgAAIAAAUAAen63NgAAAAASUVORK5CYII=";
  const expectedBytes = Buffer.from(tinyPng, "base64");
  const fingerprint = crypto.createHash("sha256").update(`download-${Date.now()}-${Math.random()}`).digest("hex");

  const entryBody = JSON.stringify({
    clientId: "cli002",
    entryType: "assessment",
    title: "Attachment download test",
    body: "Verifies the signed-fetch path for attachments.",
    tags: ["attachments-test"],
    reason: "attachment download regression",
    attachments: [{ name: "pixel.png", type: "image/png", sizeBytes: expectedBytes.length, fingerprint, data: tinyPng }]
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

  const unsignedRes = await fetch(`${BASE}${downloadPath}`, {
    method: "GET",
    headers: { cookie: clinician.cookie }
  });
  assert.equal(unsignedRes.status, 401, "unsigned attachment download must be rejected by the protected chain");

  const signedRes = await fetch(`${BASE}${downloadPath}`, {
    method: "GET",
    headers: trustedHeaders(clinician, downloadPath)
  });
  assert.equal(signedRes.status, 200, "signed attachment download must succeed");
  assert.match(signedRes.headers.get("content-type") || "", /image\/png/, "Content-Type must be propagated");
  const downloaded = Buffer.from(await signedRes.arrayBuffer());
  assert.deepEqual(downloaded, expectedBytes, "downloaded bytes must match the originals");
});

test("/mindtrack/search rejects malformed regex inputs at the validator boundary", async () => {
  const clinician = await login("clinician", CLINICIAN_PASS);

  const cases = [
    { label: "200+ char query", q: "a".repeat(250), expectedCode: "SEARCH_QUERY_TOO_LONG" },
    { label: "NUL byte", q: "foo%00bar", expectedCode: "SEARCH_QUERY_INVALID" },
    { label: "control char (BEL)", q: "foo%07bar", expectedCode: "SEARCH_QUERY_INVALID" }
  ];
  for (const tc of cases) {
    const path = `/api/v1/mindtrack/search?q=${tc.q}`;
    const res = await fetch(`${BASE}${path}`, { headers: trustedHeaders(clinician, path) });
    assert.equal(res.status, 400, `${tc.label}: expected 400, got ${res.status}`);
    const json = await res.json();
    assert.equal(json.code, tc.expectedCode, `${tc.label}: code mismatch`);
  }
});

test("/mindtrack/search treats injected regex syntax as a literal substring (no injection)", async () => {
  const clinician = await login("clinician", CLINICIAN_PASS);
  const path = `/api/v1/mindtrack/search?q=${encodeURIComponent("(.*)+")}`;
  const res = await fetch(`${BASE}${path}`, { headers: trustedHeaders(clinician, path) });
  assert.equal(res.status, 200, "valid (escaped) input must return 200");
  const json = await res.json();
  for (const entry of json.data?.entries || []) {
    const haystack = `${entry.title || ""} ${entry.body || ""}`;
    assert.ok(haystack.includes("(.*)+"), "an entry returned by the escaped search must literally contain the query");
  }
});

test("entry amend: create → amend with idempotency replay and correct entry update", async () => {
  const clinician = await login("clinician", CLINICIAN_PASS);

  const entryBody = JSON.stringify({
    clientId: "cli002",
    entryType: "assessment",
    title: "Amend lifecycle test",
    body: "Original body — will be amended.",
    tags: ["amend-test"],
    reason: "amend lifecycle test setup"
  });
  const createRes = await fetch(`${BASE}/api/v1/mindtrack/entries`, {
    method: "POST",
    headers: trustedHeaders(clinician, "/api/v1/mindtrack/entries", { method: "POST", body: entryBody }),
    body: entryBody
  });
  assert.equal(createRes.status, 201, "entry creation must succeed for amend test");
  const createJson = await createRes.json();
  const entryId = createJson.data._id;
  assert.ok(entryId, "created entry must have an _id");

  const amendBody = JSON.stringify({ expectedVersion: 1, body: "Amended body — correction applied.", reason: "amend lifecycle test correction" });
  const amendKey = crypto.randomUUID();

  const firstAmend = await fetch(`${BASE}/api/v1/mindtrack/entries/${entryId}/amend`, {
    method: "POST",
    headers: trustedHeaders(clinician, `/api/v1/mindtrack/entries/${entryId}/amend`, { method: "POST", body: amendBody, idempotencyKey: amendKey }),
    body: amendBody
  });
  assert.equal(firstAmend.status, 200, "first amend must succeed");
  const firstAmendJson = await firstAmend.json();
  assert.equal(Boolean(firstAmendJson.idempotentReplay), false, "first amend must not be a replay");

  const secondAmend = await fetch(`${BASE}/api/v1/mindtrack/entries/${entryId}/amend`, {
    method: "POST",
    headers: trustedHeaders(clinician, `/api/v1/mindtrack/entries/${entryId}/amend`, { method: "POST", body: amendBody, idempotencyKey: amendKey }),
    body: amendBody
  });
  assert.equal(secondAmend.status, 200, "idempotent amend replay must return 200");
  const secondAmendJson = await secondAmend.json();
  assert.equal(Boolean(secondAmendJson.idempotentReplay), true, "second amend must be flagged as replay");
});

test("entry delete and restore: create → delete → restore lifecycle with idempotency", async () => {
  const clinician = await login("clinician", CLINICIAN_PASS);

  const entryBody = JSON.stringify({
    clientId: "cli002",
    entryType: "follow_up",
    title: "Delete/restore lifecycle test",
    body: "Body for delete-restore lifecycle test.",
    tags: ["delete-restore-test"],
    reason: "delete-restore lifecycle test setup"
  });
  const createRes = await fetch(`${BASE}/api/v1/mindtrack/entries`, {
    method: "POST",
    headers: trustedHeaders(clinician, "/api/v1/mindtrack/entries", { method: "POST", body: entryBody }),
    body: entryBody
  });
  assert.equal(createRes.status, 201, "entry creation must succeed for delete-restore test");
  const createJson = await createRes.json();
  const entryId = createJson.data._id;

  const deleteBody = JSON.stringify({ expectedVersion: 1, reason: "lifecycle test deletion" });
  const deleteKey = crypto.randomUUID();
  const deleteRes = await fetch(`${BASE}/api/v1/mindtrack/entries/${entryId}/delete`, {
    method: "POST",
    headers: trustedHeaders(clinician, `/api/v1/mindtrack/entries/${entryId}/delete`, { method: "POST", body: deleteBody, idempotencyKey: deleteKey }),
    body: deleteBody
  });
  assert.equal(deleteRes.status, 200, "entry delete must succeed");
  const deleteJson = await deleteRes.json();
  assert.equal(Boolean(deleteJson.idempotentReplay), false, "first delete must not be a replay");

  const versionAfterDelete = deleteJson.data?.version ?? 2;

  const restoreBody = JSON.stringify({ expectedVersion: versionAfterDelete, reason: "lifecycle test restore" });
  const restoreKey = crypto.randomUUID();
  const restoreRes = await fetch(`${BASE}/api/v1/mindtrack/entries/${entryId}/restore`, {
    method: "POST",
    headers: trustedHeaders(clinician, `/api/v1/mindtrack/entries/${entryId}/restore`, { method: "POST", body: restoreBody, idempotencyKey: restoreKey }),
    body: restoreBody
  });
  assert.equal(restoreRes.status, 200, "entry restore must succeed");
  const restoreJson = await restoreRes.json();
  assert.equal(Boolean(restoreJson.idempotentReplay), false, "first restore must not be a replay");

  const restoreReplayRes = await fetch(`${BASE}/api/v1/mindtrack/entries/${entryId}/restore`, {
    method: "POST",
    headers: trustedHeaders(clinician, `/api/v1/mindtrack/entries/${entryId}/restore`, { method: "POST", body: restoreBody, idempotencyKey: restoreKey }),
    body: restoreBody
  });
  assert.equal(restoreReplayRes.status, 200, "idempotent restore replay must return 200");
  const restoreReplayJson = await restoreReplayRes.json();
  assert.equal(Boolean(restoreReplayJson.idempotentReplay), true, "second restore must be flagged as replay");
});

test("GET /mindtrack/search/trending returns a trending term array for all roles", async () => {
  const clinician = await login("clinician", CLINICIAN_PASS);
  const admin = await login("administrator", ADMIN_PASS);
  const client = await login("client", CLIENT_PASS);

  for (const [label, session] of [["clinician", clinician], ["admin", admin]]) {
    const res = await fetch(`${BASE}/api/v1/mindtrack/search/trending`, {
      headers: trustedHeaders(session, "/api/v1/mindtrack/search/trending")
    });
    assert.equal(res.status, 200, `${label} must be able to call trending terms`);
    const json = await res.json();
    assert.ok(Array.isArray(json.data), `${label}: trending data must be an array`);
    for (const term of json.data) {
      assert.ok(typeof term.term === "string", `${label}: each trending entry must have a term string`);
      assert.ok(typeof term.count === "number", `${label}: each trending entry must have a count number`);
    }
  }

  const clientRes = await fetch(`${BASE}/api/v1/mindtrack/search/trending`, {
    headers: trustedHeaders(client, "/api/v1/mindtrack/search/trending")
  });
  assert.equal(clientRes.status, 200, "client must be able to access trending terms");
  const clientJson = await clientRes.json();
  assert.ok(Array.isArray(clientJson.data), "client: trending data must be an array");
});
