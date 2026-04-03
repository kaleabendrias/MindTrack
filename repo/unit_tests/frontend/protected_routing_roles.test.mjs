import test from "node:test";
import assert from "node:assert/strict";
import { defaultRouteForRole, roleCanAccessPath } from "../../apps/frontend/src/app/routePolicy.js";
import { canAccessRole } from "../../apps/frontend/src/app/roleLogic.js";

test("protected routing: client is locked to /client only", () => {
  assert.equal(roleCanAccessPath("client", "/client"), true);
  assert.equal(roleCanAccessPath("client", "/clinician"), false);
  assert.equal(roleCanAccessPath("client", "/administrator"), false);
  assert.equal(roleCanAccessPath("client", "/login"), false);
  assert.equal(roleCanAccessPath("client", "/"), false);
});

test("protected routing: clinician is locked to /clinician only", () => {
  assert.equal(roleCanAccessPath("clinician", "/clinician"), true);
  assert.equal(roleCanAccessPath("clinician", "/client"), false);
  assert.equal(roleCanAccessPath("clinician", "/administrator"), false);
});

test("protected routing: administrator is locked to /administrator only", () => {
  assert.equal(roleCanAccessPath("administrator", "/administrator"), true);
  assert.equal(roleCanAccessPath("administrator", "/client"), false);
  assert.equal(roleCanAccessPath("administrator", "/clinician"), false);
});

test("unauthenticated user redirects to /login", () => {
  assert.equal(defaultRouteForRole(null), "/login");
  assert.equal(defaultRouteForRole(undefined), "/login");
  assert.equal(defaultRouteForRole(""), "/login");
});

test("each role maps to correct default route", () => {
  assert.equal(defaultRouteForRole("client"), "/client");
  assert.equal(defaultRouteForRole("clinician"), "/clinician");
  assert.equal(defaultRouteForRole("administrator"), "/administrator");
});

test("canAccessRole: administrator can see all roles, others only their own", () => {
  assert.equal(canAccessRole("administrator", "administrator"), true);
  assert.equal(canAccessRole("administrator", "clinician"), true);
  assert.equal(canAccessRole("administrator", "client"), true);
  assert.equal(canAccessRole("clinician", "clinician"), true);
  assert.equal(canAccessRole("clinician", "administrator"), false);
  assert.equal(canAccessRole("client", "client"), true);
  assert.equal(canAccessRole("client", "clinician"), false);
});

test("role isolation: no cross-module access possible", () => {
  const roles = ["client", "clinician", "administrator"];
  for (const role of roles) {
    const otherRoles = roles.filter((r) => r !== role);
    for (const other of otherRoles) {
      assert.equal(roleCanAccessPath(role, `/${other}`), false,
        `${role} must not access /${other}`);
    }
  }
});

test("unknown role gets /login default and no path access", () => {
  assert.equal(defaultRouteForRole("operator"), "/login");
  assert.equal(roleCanAccessPath("operator", "/client"), false);
  assert.equal(roleCanAccessPath("operator", "/clinician"), false);
  assert.equal(roleCanAccessPath("operator", "/administrator"), false);
});
