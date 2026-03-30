import test from "node:test";
import assert from "node:assert/strict";
import { defaultRouteForRole, roleCanAccessPath } from "../../apps/frontend/src/app/routePolicy.js";

test("default route policy is role-specific and deny-by-default", () => {
  assert.equal(defaultRouteForRole("client"), "/client");
  assert.equal(defaultRouteForRole("clinician"), "/clinician");
  assert.equal(defaultRouteForRole("administrator"), "/administrator");
  assert.equal(roleCanAccessPath("client", "/administrator"), false);
  assert.equal(roleCanAccessPath("clinician", "/clinician"), true);
});

test("deny-by-default for unknown roles", () => {
  assert.equal(defaultRouteForRole("unknown"), "/login");
  assert.equal(defaultRouteForRole(undefined), "/login");
  assert.equal(defaultRouteForRole(null), "/login");
  assert.equal(defaultRouteForRole(""), "/login");
});

test("role isolation: each role can only access its own route", () => {
  const roles = ["client", "clinician", "administrator"];
  const routes = ["/client", "/clinician", "/administrator"];

  for (const role of roles) {
    for (const route of routes) {
      const expected = route === `/${role}`;
      assert.equal(
        roleCanAccessPath(role, route),
        expected,
        `${role} accessing ${route} should be ${expected}`
      );
    }
  }
});

test("unauthenticated users can only access login", () => {
  assert.equal(roleCanAccessPath(null, "/login"), true);
  assert.equal(roleCanAccessPath(null, "/client"), false);
  assert.equal(roleCanAccessPath(null, "/clinician"), false);
  assert.equal(roleCanAccessPath(null, "/administrator"), false);
  assert.equal(roleCanAccessPath(undefined, "/client"), false);
});

test("no role can access arbitrary paths", () => {
  const roles = ["client", "clinician", "administrator"];
  const badPaths = ["/admin", "/api", "/settings", "/users", "/", "/dashboard"];

  for (const role of roles) {
    for (const path of badPaths) {
      assert.equal(roleCanAccessPath(role, path), false, `${role} should not access ${path}`);
    }
  }
});
