import test from "node:test";
import assert from "node:assert/strict";
import {
  canAccessRole,
  deriveSearchSuggestionState,
  statusCue,
  validateTimelineEntry
} from "../../apps/frontend/src/app/roleLogic.js";

test("role gating allows admin all and others scoped", () => {
  assert.equal(canAccessRole("administrator", "clinician"), true);
  assert.equal(canAccessRole("clinician", "clinician"), true);
  assert.equal(canAccessRole("clinician", "client"), false);
});

test("timeline status cues map to expected visual states", () => {
  assert.equal(statusCue("draft"), "badge--draft");
  assert.equal(statusCue("signed"), "badge--signed");
  assert.equal(statusCue("amended"), "badge--amended");
});

test("inline entry validation reports required fields", () => {
  const errors = validateTimelineEntry({ clientId: "", title: "", body: "" });
  assert.ok(errors.clientId);
  assert.ok(errors.title);
  assert.ok(errors.body);
});

test("search suggestion logic dedupes and caps lists", () => {
  const state = deriveSearchSuggestionState(
    ["sleep", "sleep", "anxiety", "follow-up"],
    [{ term: "sleep", count: 8 }, { term: "anxiety", count: 4 }]
  );

  assert.deepEqual(state.recent, ["sleep", "anxiety", "follow-up"]);
  assert.equal(state.trending.length, 2);
});
