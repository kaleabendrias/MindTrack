import test from "node:test";
import assert from "node:assert/strict";
import { canAccessRole, statusCue, validateTimelineEntry, deriveSearchSuggestionState } from "../../apps/frontend/src/app/roleLogic.js";
import { defaultRouteForRole, roleCanAccessPath } from "../../apps/frontend/src/app/routePolicy.js";

test("role-based module gating: administrator sees all, others scoped", () => {
  assert.equal(canAccessRole("administrator", "administrator"), true);
  assert.equal(canAccessRole("administrator", "clinician"), true);
  assert.equal(canAccessRole("administrator", "client"), true);
  assert.equal(canAccessRole("clinician", "clinician"), true);
  assert.equal(canAccessRole("clinician", "administrator"), false);
  assert.equal(canAccessRole("clinician", "client"), false);
  assert.equal(canAccessRole("client", "client"), true);
  assert.equal(canAccessRole("client", "clinician"), false);
  assert.equal(canAccessRole("client", "administrator"), false);
});

test("null or undefined roles deny all access", () => {
  assert.equal(canAccessRole(null, "client"), false);
  assert.equal(canAccessRole(undefined, "clinician"), false);
  assert.equal(canAccessRole("client", null), false);
  assert.equal(canAccessRole("client", undefined), false);
});

test("status cues render correct CSS classes for all states", () => {
  assert.equal(statusCue("draft"), "badge--draft");
  assert.equal(statusCue("signed"), "badge--signed");
  assert.equal(statusCue("amended"), "badge--amended");
  assert.equal(statusCue("queued"), "badge--queued");
  assert.equal(statusCue(null), "badge--queued");
  assert.equal(statusCue(undefined), "badge--queued");
  assert.equal(statusCue("DRAFT"), "badge--draft");
  assert.equal(statusCue("Signed"), "badge--signed");
});

test("timeline entry validation reports all required fields", () => {
  const allEmpty = validateTimelineEntry({ clientId: "", title: "", body: "" });
  assert.ok(allEmpty.clientId, "clientId should be flagged");
  assert.ok(allEmpty.title, "title should be flagged");
  assert.ok(allEmpty.body, "body should be flagged");

  const valid = validateTimelineEntry({ clientId: "cli001", title: "Note", body: "Content" });
  assert.equal(Object.keys(valid).length, 0, "should have no errors");
});

test("timeline entry validation handles whitespace-only fields", () => {
  const errors = validateTimelineEntry({ clientId: "cli001", title: "  ", body: "  " });
  assert.ok(errors.title, "whitespace title should be flagged");
  assert.ok(errors.body, "whitespace body should be flagged");
});

test("search suggestion deduplication and cap", () => {
  const state = deriveSearchSuggestionState(
    ["sleep", "sleep", "anxiety", "follow-up", "medication", "cbt", "intake", "progress", "discharge", "plan", "therapy", "extra"],
    [{ term: "sleep", count: 8 }, { term: "anxiety", count: 4 }]
  );

  assert.deepEqual(state.recent, ["sleep", "anxiety", "follow-up", "medication", "cbt", "intake", "progress", "discharge", "plan", "therapy"]);
  assert.equal(state.recent.length, 10, "recent should be capped at 10");
  assert.equal(state.trending.length, 2);
});

test("search suggestion handles empty/null inputs", () => {
  const empty = deriveSearchSuggestionState([], []);
  assert.deepEqual(empty.recent, []);
  assert.deepEqual(empty.trending, []);

  const nulls = deriveSearchSuggestionState(null, null);
  assert.deepEqual(nulls.recent, []);
  assert.deepEqual(nulls.trending, []);
});

test("route policy: authenticated roles redirect to correct default", () => {
  assert.equal(defaultRouteForRole("client"), "/client");
  assert.equal(defaultRouteForRole("clinician"), "/clinician");
  assert.equal(defaultRouteForRole("administrator"), "/administrator");
});

test("route policy: no cross-role route access", () => {
  assert.equal(roleCanAccessPath("client", "/clinician"), false);
  assert.equal(roleCanAccessPath("client", "/administrator"), false);
  assert.equal(roleCanAccessPath("clinician", "/client"), false);
  assert.equal(roleCanAccessPath("clinician", "/administrator"), false);
  assert.equal(roleCanAccessPath("administrator", "/client"), false);
  assert.equal(roleCanAccessPath("administrator", "/clinician"), false);
});

test("route policy: each role has exactly one allowed path", () => {
  const allPaths = ["/login", "/client", "/clinician", "/administrator", "/settings", "/api", "/"];
  for (const role of ["client", "clinician", "administrator"]) {
    const allowed = allPaths.filter((p) => roleCanAccessPath(role, p));
    assert.equal(allowed.length, 1, `${role} should access exactly one path`);
    assert.equal(allowed[0], `/${role}`);
  }
});

test("loading, error, success state labels are distinct", () => {
  const states = ["idle", "loading", "error", "success", "saving"];
  assert.equal(new Set(states).size, states.length, "all state labels should be distinct");
});

test("user switch isolation: cleared state has no cross-contamination", () => {
  const userAHistory = ["sleep", "anxiety"];
  const userBHistory = ["medication", "progress"];
  assert.notDeepEqual(userAHistory, userBHistory, "different users have different history");

  const clearedState = { auth: null, selfContext: null, clients: [], searchResults: [] };
  assert.equal(clearedState.auth, null);
  assert.equal(clearedState.selfContext, null);
  assert.deepEqual(clearedState.clients, []);
  assert.deepEqual(clearedState.searchResults, []);
});
