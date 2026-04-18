import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { BASE, ADMIN_PASS, CLINICIAN_PASS, login, trustedHeaders } from "./helpers.mjs";

// ---------------------------------------------------------------------------
// Users: user management, custom profile fields
// ---------------------------------------------------------------------------

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

test("custom profile-field PATCH and DELETE full lifecycle", async () => {
  const admin = await login("administrator", ADMIN_PASS);

  const uniqueSuffix = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const fieldKey = `test_field_${uniqueSuffix}`;

  const createBody = JSON.stringify({
    field: { key: fieldKey, label: "Test Custom Field", fieldType: "text", visibleTo: ["administrator", "clinician"] },
    reason: "integration test field creation"
  });
  const createRes = await fetch(`${BASE}/api/v1/system/profile-fields/custom`, {
    method: "POST",
    headers: trustedHeaders(admin, "/api/v1/system/profile-fields/custom", { method: "POST", body: createBody }),
    body: createBody
  });
  assert.ok([200, 201].includes(createRes.status), `custom field creation must succeed, got ${createRes.status}`);

  const patchPath = `/api/v1/system/profile-fields/custom/${fieldKey}`;
  const patchBody = JSON.stringify({ updates: { label: "Updated Custom Field Label", visibleTo: ["administrator"] }, reason: "integration test label update" });
  const patchRes = await fetch(`${BASE}${patchPath}`, {
    method: "PATCH",
    headers: trustedHeaders(admin, patchPath, { method: "PATCH", body: patchBody }),
    body: patchBody
  });
  assert.equal(patchRes.status, 200, "custom field PATCH must succeed");
  const patchJson = await patchRes.json();
  assert.ok(patchJson.data, "PATCH must return the updated field data");

  const deletePath = `/api/v1/system/profile-fields/custom/${fieldKey}`;
  const deleteBody = JSON.stringify({ reason: "integration test cleanup" });
  const deleteRes = await fetch(`${BASE}${deletePath}`, {
    method: "DELETE",
    headers: trustedHeaders(admin, deletePath, { method: "DELETE", body: deleteBody }),
    body: deleteBody
  });
  assert.equal(deleteRes.status, 200, "custom field DELETE must succeed");
  const deleteResJson = await deleteRes.json();
  assert.ok(deleteResJson.data, "DELETE must return a confirmation payload");
});

test("custom profile-field PATCH and DELETE are forbidden for non-admin roles", async () => {
  const clinician = await login("clinician", CLINICIAN_PASS);

  const patchPath = "/api/v1/system/profile-fields/custom/some_key";
  const patchBody = JSON.stringify({ updates: { label: "x" }, reason: "forbidden test" });
  const patchRes = await fetch(`${BASE}${patchPath}`, {
    method: "PATCH",
    headers: trustedHeaders(clinician, patchPath, { method: "PATCH", body: patchBody }),
    body: patchBody
  });
  assert.equal(patchRes.status, 403, "clinician must not PATCH custom profile fields");

  const deletePath = "/api/v1/system/profile-fields/custom/some_key";
  const deleteBody = JSON.stringify({ reason: "forbidden test" });
  const deleteRes = await fetch(`${BASE}${deletePath}`, {
    method: "DELETE",
    headers: trustedHeaders(clinician, deletePath, { method: "DELETE", body: deleteBody }),
    body: deleteBody
  });
  assert.equal(deleteRes.status, 403, "clinician must not DELETE custom profile fields");
});

test("GET /users lists all users and is restricted to admin", async () => {
  const admin = await login("administrator", ADMIN_PASS);
  const clinician = await login("clinician", CLINICIAN_PASS);

  const adminRes = await fetch(`${BASE}/api/v1/users`, { headers: trustedHeaders(admin, "/api/v1/users") });
  assert.equal(adminRes.status, 200, "admin must be able to list users");
  const adminJson = await adminRes.json();
  assert.ok(Array.isArray(adminJson.data), "user list must be an array");
  assert.ok(adminJson.data.length >= 3, "at least the three seeded users must be present");
  for (const user of adminJson.data) {
    assert.ok(user._id || user.id, "each user entry must have an id");
    assert.ok(user.username, "each user entry must have a username");
    assert.ok(user.role, "each user entry must have a role");
  }

  const clinicianRes = await fetch(`${BASE}/api/v1/users`, { headers: trustedHeaders(clinician, "/api/v1/users") });
  assert.equal(clinicianRes.status, 403, "clinician must not list users");
});

test("POST /users creates a new user and POST /users/:id/reset-password resets their password", async () => {
  const admin = await login("administrator", ADMIN_PASS);

  const uniqueSuffix = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const newUsername = `testclinician_${uniqueSuffix}`;
  const newPassword = `InitialPass${uniqueSuffix.slice(0, 4)}2026!`;
  const createBody = JSON.stringify({
    username: newUsername,
    password: newPassword,
    role: "clinician",
    securityQuestions: [{ question: "What is your integration test station?", answer: "test-station-alpha" }],
    reason: "integration test user creation"
  });
  const createRes = await fetch(`${BASE}/api/v1/users`, {
    method: "POST",
    headers: trustedHeaders(admin, "/api/v1/users", { method: "POST", body: createBody }),
    body: createBody
  });
  assert.equal(createRes.status, 201, "admin must be able to create a new user");
  const createJson = await createRes.json();
  const newUserId = createJson.data?._id || createJson.data?.id;
  assert.ok(newUserId, "created user must have an id");
  assert.equal(createJson.data.username, newUsername, "created user must have the correct username");
  assert.equal(createJson.data.role, "clinician", "created user must have the correct role");

  const listRes = await fetch(`${BASE}/api/v1/users`, { headers: trustedHeaders(admin, "/api/v1/users") });
  const listJson = await listRes.json();
  const found = listJson.data.some((u) => u.username === newUsername);
  assert.equal(found, true, "newly created user must appear in the user list");

  const resetPath = `/api/v1/users/${newUserId}/reset-password`;
  const resetBody = JSON.stringify({ newPassword: `ResetPass${uniqueSuffix.slice(0, 4)}2026!`, reason: "integration test admin password reset" });
  const resetRes = await fetch(`${BASE}${resetPath}`, {
    method: "POST",
    headers: trustedHeaders(admin, resetPath, { method: "POST", body: resetBody }),
    body: resetBody
  });
  assert.equal(resetRes.status, 200, "admin password reset must succeed");
  const resetJson = await resetRes.json();
  assert.equal(resetJson.data?.success, true, "reset response must confirm success");
});

test("POST /users create-user rejects malformed payloads", async () => {
  const admin = await login("administrator", ADMIN_PASS);

  const malformedCases = [
    { label: "missing username", body: { password: "ValidPass12345!", role: "clinician", securityQuestions: [{ question: "q", answer: "a" }], reason: "x" } },
    { label: "missing role", body: { username: "u", password: "ValidPass12345!", securityQuestions: [{ question: "q", answer: "a" }], reason: "x" } },
    { label: "invalid role", body: { username: "u", password: "ValidPass12345!", role: "superadmin", securityQuestions: [{ question: "q", answer: "a" }], reason: "x" } },
    { label: "empty securityQuestions", body: { username: "u", password: "ValidPass12345!", role: "clinician", securityQuestions: [], reason: "x" } },
    { label: "missing securityQuestions", body: { username: "u", password: "ValidPass12345!", role: "clinician", reason: "x" } }
  ];

  for (const tc of malformedCases) {
    const body = JSON.stringify(tc.body);
    const res = await fetch(`${BASE}/api/v1/users`, {
      method: "POST",
      headers: trustedHeaders(admin, "/api/v1/users", { method: "POST", body }),
      body
    });
    assert.equal(res.status, 400, `${tc.label}: expected 400, got ${res.status}`);
  }
});
