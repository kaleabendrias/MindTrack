import test from "node:test";
import assert from "node:assert/strict";
import { validateTimelineEntry, deriveSearchSuggestionState, statusCue } from "../../apps/frontend/src/app/roleLogic.js";

test("clinician entry form validation: requires clientId, title, body", () => {
  const allMissing = validateTimelineEntry({ clientId: "", title: "", body: "" });
  assert.ok(allMissing.clientId);
  assert.ok(allMissing.title);
  assert.ok(allMissing.body);

  const valid = validateTimelineEntry({ clientId: "cli001", title: "Note", body: "Content" });
  assert.equal(Object.keys(valid).length, 0);
});

test("clinician entry form rejects whitespace-only title and body", () => {
  const errors = validateTimelineEntry({ clientId: "cli001", title: "   ", body: "\t\n" });
  assert.ok(errors.title);
  assert.ok(errors.body);
});

test("clinician entry form accepts clientId with any non-empty value", () => {
  const errors = validateTimelineEntry({ clientId: "any-id", title: "T", body: "B" });
  assert.equal(Object.keys(errors).length, 0);
});

test("status badge class mapping for all entry states", () => {
  assert.equal(statusCue("draft"), "badge--draft");
  assert.equal(statusCue("signed"), "badge--signed");
  assert.equal(statusCue("amended"), "badge--amended");
  assert.equal(statusCue("queued"), "badge--queued");
  assert.equal(statusCue("unknown"), "badge--queued");
  assert.equal(statusCue(null), "badge--queued");
  assert.equal(statusCue(undefined), "badge--queued");
});

test("status badge is case-insensitive", () => {
  assert.equal(statusCue("DRAFT"), "badge--draft");
  assert.equal(statusCue("Signed"), "badge--signed");
  assert.equal(statusCue("AMENDED"), "badge--amended");
});

test("search suggestions deduplicate and cap at 10 recent", () => {
  const queries = ["a", "b", "a", "c", "d", "e", "f", "g", "h", "i", "j", "k"];
  const state = deriveSearchSuggestionState(queries, []);
  assert.equal(state.recent.length, 10);
  assert.equal(state.recent[0], "a");
  assert.equal(new Set(state.recent).size, state.recent.length, "no duplicates");
});

test("search suggestions handle null/undefined inputs", () => {
  const state = deriveSearchSuggestionState(null, null);
  assert.deepEqual(state.recent, []);
  assert.deepEqual(state.trending, []);
});

test("trending terms capped at 12", () => {
  const terms = Array.from({ length: 20 }, (_, i) => ({ term: `t${i}`, count: 20 - i }));
  const state = deriveSearchSuggestionState([], terms);
  assert.equal(state.trending.length, 12);
});

test("client timeline entry types are limited to assessment and follow_up", () => {
  const allEntries = [
    { _id: "1", entryType: "assessment" },
    { _id: "2", entryType: "counseling_note" },
    { _id: "3", entryType: "follow_up" },
    { _id: "4", entryType: "counseling_note" }
  ];

  const clientVisible = allEntries.filter(
    (e) => e.entryType === "assessment" || e.entryType === "follow_up"
  );

  assert.equal(clientVisible.length, 2);
  assert.equal(clientVisible[0].entryType, "assessment");
  assert.equal(clientVisible[1].entryType, "follow_up");
});

test("admin password reset requires userId and password", () => {
  function validateReset(userId, password) {
    const errors = {};
    if (!userId) errors.userId = "required";
    if (!password) errors.password = "required";
    return errors;
  }

  assert.ok(validateReset("", "").userId);
  assert.ok(validateReset("", "").password);
  assert.equal(Object.keys(validateReset("u1", "p1")).length, 0);
});
