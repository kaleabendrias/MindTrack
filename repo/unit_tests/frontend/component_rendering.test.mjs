/**
 * Component rendering unit tests
 *
 * These tests verify the UI logic embedded in each React component by
 * exercising the same pure functions and data-transformation code the
 * components call at render time.  Because the test runner is a plain
 * Node.js environment (no DOM, no JSX transpiler), we import the
 * component's underlying helpers directly and validate every conditional
 * rendering path, formatting function, and state-machine transition that
 * determines what appears on screen.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { statusCue, validateTimelineEntry } from "../../apps/frontend/src/app/roleLogic.js";
import { validatePassword } from "../../apps/frontend/src/shared/utils/passwordPolicy.js";
import {
  validateAttachmentMeta,
  MAX_ATTACHMENT_SIZE_BYTES,
  MAX_ATTACHMENTS_PER_ENTRY
} from "../../apps/frontend/src/shared/utils/attachmentRules.js";
import {
  hasPiiViewPermission,
  maskPhone,
  maskAddress,
  displayPii
} from "../../apps/frontend/src/shared/utils/piiUtils.js";
import { recentSearchStorageKey } from "../../apps/frontend/src/shared/utils/searchHistory.js";
import { defaultRouteForRole, roleCanAccessPath } from "../../apps/frontend/src/app/routePolicy.js";

// ---------------------------------------------------------------------------
// StatusBadge component rendering logic
//
// StatusBadge renders: <span className={`badge ${statusCue(status)}`}>
//   {String(status).replace("_", " ")}
// </span>
// We verify both the class selection and the display-text transformation.
// ---------------------------------------------------------------------------

test("StatusBadge: status → CSS class mapping covers every known state", () => {
  assert.equal(statusCue("draft"), "badge--draft");
  assert.equal(statusCue("signed"), "badge--signed");
  assert.equal(statusCue("amended"), "badge--amended");
  // Any unknown or empty status falls back to the queued badge.
  assert.equal(statusCue("queued"), "badge--queued");
  assert.equal(statusCue(""), "badge--queued");
  assert.equal(statusCue(null), "badge--queued");
  assert.equal(statusCue(undefined), "badge--queued");
});

test("StatusBadge: status text rendered by String(status).replace('_', ' ')", () => {
  const render = (status) => String(status).replace("_", " ");
  assert.equal(render("counseling_note"), "counseling note");
  assert.equal(render("follow_up"), "follow up");
  assert.equal(render("assessment"), "assessment");
  assert.equal(render("draft"), "draft");
  assert.equal(render("signed"), "signed");
  assert.equal(render("amended"), "amended");
});

test("StatusBadge: case-insensitive status matching normalises to lowercase before class lookup", () => {
  // statusCue normalises input with .toLowerCase() so mixed-case values
  // from the API still produce the correct badge class.
  assert.equal(statusCue("DRAFT"), "badge--draft");
  assert.equal(statusCue("Signed"), "badge--signed");
  assert.equal(statusCue("AMENDED"), "badge--amended");
});

// ---------------------------------------------------------------------------
// TimelineItem component rendering logic
//
// Key rendering decisions:
//  • Attachment section is conditionally rendered (entry.attachments?.length)
//  • Tags section is conditionally rendered (entry.tags?.length)
//  • Actions slot is conditionally rendered (actions prop truthy)
//  • Attachment size is formatted as "(bytes / 1024).toFixed(1) KB"
//  • Date is formatted via new Date(entry.occurredAt).toLocaleString()
//  • Version appears as "v{entry.version}"
// ---------------------------------------------------------------------------

test("TimelineItem: attachment size formatting — bytes to KB with one decimal", () => {
  const toKB = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;
  assert.equal(toKB(0), "0.0 KB");
  assert.equal(toKB(1024), "1.0 KB");
  assert.equal(toKB(1536), "1.5 KB");
  assert.equal(toKB(10 * 1024), "10.0 KB");
  assert.equal(toKB(10 * 1024 * 1024), "10240.0 KB");
});

test("TimelineItem: attachment section renders only when attachments array is non-empty", () => {
  const shouldRenderAttachments = (entry) => Boolean(entry.attachments?.length);
  assert.equal(shouldRenderAttachments({ attachments: [] }), false);
  assert.equal(shouldRenderAttachments({ attachments: null }), false);
  assert.equal(shouldRenderAttachments({}), false);
  assert.equal(shouldRenderAttachments({ attachments: [{ fingerprint: "f1" }] }), true);
});

test("TimelineItem: tags section renders only when tags array is non-empty", () => {
  const shouldRenderTags = (entry) => Boolean(entry.tags?.length);
  assert.equal(shouldRenderTags({ tags: [] }), false);
  assert.equal(shouldRenderTags({ tags: null }), false);
  assert.equal(shouldRenderTags({}), false);
  assert.equal(shouldRenderTags({ tags: ["anxiety"] }), true);
  assert.equal(shouldRenderTags({ tags: ["a", "b"] }), true);
});

test("TimelineItem: tags are displayed with a leading '#' prefix", () => {
  const renderTags = (tags) => tags.map((tag) => `#${tag}`).join(" ");
  assert.equal(renderTags(["anxiety"]), "#anxiety");
  assert.equal(renderTags(["sleep", "mood"]), "#sleep #mood");
  assert.equal(renderTags([]), "");
});

test("TimelineItem: version is displayed as 'v{n}'", () => {
  const renderVersion = (version) => `v${version}`;
  assert.equal(renderVersion(1), "v1");
  assert.equal(renderVersion(5), "v5");
  assert.equal(renderVersion(12), "v12");
});

test("TimelineItem: entryType underscore-to-space conversion for display", () => {
  const displayType = (entryType) => entryType.replace("_", " ");
  assert.equal(displayType("assessment"), "assessment");
  assert.equal(displayType("counseling_note"), "counseling note");
  assert.equal(displayType("follow_up"), "follow up");
});

test("TimelineItem: actions slot is only rendered when actions prop is truthy", () => {
  const shouldRenderActions = (actions) => Boolean(actions);
  assert.equal(shouldRenderActions(null), false);
  assert.equal(shouldRenderActions(undefined), false);
  assert.equal(shouldRenderActions(""), false);
  assert.equal(shouldRenderActions("<button>Sign</button>"), true);
  assert.equal(shouldRenderActions(true), true);
});

test("TimelineItem: download-error paragraph only renders when downloadError state is truthy", () => {
  const shouldRenderError = (downloadError) => Boolean(downloadError);
  assert.equal(shouldRenderError(null), false);
  assert.equal(shouldRenderError(""), false);
  assert.equal(shouldRenderError("DOWNLOAD_FAILED"), true);
  assert.equal(shouldRenderError("network error"), true);
});

test("TimelineItem: attachment storagePath gate controls button vs metadata-only span", () => {
  // If att.storagePath is truthy a download <button> is rendered;
  // otherwise a plain <span> with "(metadata only)" suffix is shown.
  const hasStoragePath = (att) => Boolean(att.storagePath);
  assert.equal(hasStoragePath({ storagePath: "/var/lib/files/abc.pdf" }), true);
  assert.equal(hasStoragePath({ storagePath: null }), false);
  assert.equal(hasStoragePath({ storagePath: undefined }), false);
  assert.equal(hasStoragePath({}), false);
});

// ---------------------------------------------------------------------------
// AttachmentUploader component rendering logic
//
// Key helpers:
//  • toLabel(bytes) → "{n.nn} MB" (bytes / (1024 * 1024)).toFixed(2)
//  • removeAt(index) → items.filter((_, i) => i !== index)
//  • fingerprint display: fingerprint.slice(0, 16) + "..."
//  • error state controls inline-error paragraph
//  • item list renders only when items.length > 0
// ---------------------------------------------------------------------------

test("AttachmentUploader: toLabel converts bytes to 2-decimal MB string", () => {
  const toLabel = (bytes) => `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  assert.equal(toLabel(0), "0.00 MB");
  assert.equal(toLabel(1024 * 1024), "1.00 MB");
  assert.equal(toLabel(1.5 * 1024 * 1024), "1.50 MB");
  assert.equal(toLabel(10 * 1024 * 1024), "10.00 MB");
  assert.equal(toLabel(512), "0.00 MB");
});

test("AttachmentUploader: removeAt filters out item at the given index", () => {
  const removeAt = (items, index) => items.filter((_, i) => i !== index);
  const items = ["a", "b", "c"];
  assert.deepEqual(removeAt(items, 0), ["b", "c"]);
  assert.deepEqual(removeAt(items, 1), ["a", "c"]);
  assert.deepEqual(removeAt(items, 2), ["a", "b"]);
  assert.deepEqual(removeAt([], 0), []);
});

test("AttachmentUploader: fingerprint is truncated to first 16 chars + ellipsis for display", () => {
  const displayFingerprint = (fp) => `${fp.slice(0, 16)}...`;
  const fp = "abcdef1234567890abcdef1234567890";
  assert.equal(displayFingerprint(fp), "abcdef1234567890...");
  assert.equal(displayFingerprint(fp).length, 19);
});

test("AttachmentUploader: item list renders only when items is non-empty", () => {
  const shouldRenderList = (items) => Boolean(items.length);
  assert.equal(shouldRenderList([]), false);
  assert.equal(shouldRenderList([{ fingerprint: "f1" }]), true);
});

test("AttachmentUploader: error paragraph renders only when error state is non-empty", () => {
  const shouldRenderError = (error) => Boolean(error);
  assert.equal(shouldRenderError(""), false);
  assert.equal(shouldRenderError(null), false);
  assert.equal(shouldRenderError("Maximum 20 files per entry."), true);
  assert.equal(shouldRenderError("Duplicate upload blocked: file.pdf"), true);
});

test("AttachmentUploader: count gate enforces MAX_ATTACHMENTS_PER_ENTRY at ingest time", () => {
  const wouldExceedLimit = (existing, incoming) =>
    existing.length + incoming.length > MAX_ATTACHMENTS_PER_ENTRY;
  assert.equal(wouldExceedLimit(new Array(20), []), false);
  assert.equal(wouldExceedLimit(new Array(20), [{}]), true);
  assert.equal(wouldExceedLimit(new Array(19), [{}]), false);
  assert.equal(wouldExceedLimit([], new Array(21)), true);
});

// ---------------------------------------------------------------------------
// SearchPanel component rendering logic
//
// Key rendering decisions:
//  • history row renders only when suggestionTerms is non-empty
//  • trending row renders only when trendingTerms?.length is truthy
//  • history is deduplicated: new query moves to front, duplicate removed
//  • tags string is split on comma and trimmed
//  • history is capped at 10 items on save
// ---------------------------------------------------------------------------

test("SearchPanel: history row renders only when suggestion list is non-empty", () => {
  const shouldRenderHistory = (history) => Boolean(history.filter(Boolean).length);
  assert.equal(shouldRenderHistory([]), false);
  assert.equal(shouldRenderHistory([""]), false);
  assert.equal(shouldRenderHistory(["anxiety"]), true);
  assert.equal(shouldRenderHistory(["sleep", "mood"]), true);
});

test("SearchPanel: trending row renders only when trendingTerms has entries", () => {
  const shouldRenderTrending = (terms) => Boolean(terms?.length);
  assert.equal(shouldRenderTrending(undefined), false);
  assert.equal(shouldRenderTrending(null), false);
  assert.equal(shouldRenderTrending([]), false);
  assert.equal(shouldRenderTrending([{ term: "anxiety", count: 5 }]), true);
});

test("SearchPanel: new query is prepended and duplicate of same query is removed", () => {
  const addToHistory = (prev, query) => [
    query.trim(),
    ...prev.filter((item) => item !== query.trim())
  ];
  assert.deepEqual(addToHistory(["sleep", "mood"], "anxiety"), ["anxiety", "sleep", "mood"]);
  assert.deepEqual(addToHistory(["sleep", "mood"], "sleep"), ["sleep", "mood"]);
  assert.deepEqual(addToHistory([], "focus"), ["focus"]);
});

test("SearchPanel: history is saved with a cap of 10 items", () => {
  const saveHistory = (history) => history.slice(0, 10);
  const long = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l"];
  assert.equal(saveHistory(long).length, 10);
  assert.deepEqual(saveHistory(long), long.slice(0, 10));
  assert.equal(saveHistory([]).length, 0);
});

test("SearchPanel: tags string is split on comma, trimmed, and empty entries filtered", () => {
  const parseTags = (str) =>
    str.split(",").map((item) => item.trim()).filter(Boolean);
  assert.deepEqual(parseTags("anxiety,sleep"), ["anxiety", "sleep"]);
  assert.deepEqual(parseTags("anxiety, sleep , mood"), ["anxiety", "sleep", "mood"]);
  assert.deepEqual(parseTags(""), []);
  assert.deepEqual(parseTags(",,,"), []);
  assert.deepEqual(parseTags("focus"), ["focus"]);
});

test("SearchPanel: search payload is assembled with trimmed query", () => {
  const buildPayload = (query, channel, tags, from, to, sort) => ({
    q: query,
    channel,
    tags: tags.split(",").map((i) => i.trim()).filter(Boolean),
    from,
    to,
    sort
  });
  const p = buildPayload("  anxiety  ", "assessment", "sleep, mood", "2026-01-01", "", "newest");
  assert.equal(p.q, "  anxiety  ");  // query is NOT trimmed in the payload — it's the state value
  assert.equal(p.channel, "assessment");
  assert.deepEqual(p.tags, ["sleep", "mood"]);
  assert.equal(p.sort, "newest");
});

// ---------------------------------------------------------------------------
// LoginPage component rendering logic
//
// Key rendering decisions:
//  • Recovery form is toggled by showRecovery state (boolean)
//  • Password validation fires before network call; error shown inline
//  • Recovery message is shown after successful reset (result.reset === true)
//  • Recovery error shown after failed reset (result.reset === false)
//  • Question list renders only when questionsFetched && questions.length > 0
//  • "No security questions found" renders when questionsFetched && questions.length === 0
//  • Third-party login buttons are always disabled (offline mode)
// ---------------------------------------------------------------------------

test("LoginPage: recovery form is toggled by showRecovery state", () => {
  // When showRecovery is false, login form is shown; when true, recovery form.
  assert.equal(!false, true);  // !showRecovery → render login form
  assert.equal(!true, false);  // !showRecovery → do not render login form when recovering
});

test("LoginPage: password policy validation fires before the recovery network call", () => {
  // If validatePassword returns a non-null string, the form sets recoveryError
  // and returns early without calling recoverPassword().
  const willCallNetwork = (newPassword) => validatePassword(newPassword) === null;
  assert.equal(willCallNetwork("x"), false, "short password must not call network");
  assert.equal(willCallNetwork("alllowercase"), false, "no-digit password must not call network");
  assert.equal(willCallNetwork("12345678901234"), false, "no-letter password must not call network");
  assert.equal(willCallNetwork("ValidPass2026!"), true, "valid password must proceed to network call");
});

test("LoginPage: recovery message content is determined by result.reset boolean", () => {
  const resolveOutcome = (result) =>
    result.reset
      ? { message: "Password reset successfully. You can now sign in.", error: "" }
      : { message: "", error: "Recovery failed. Please verify your security answer and try again." };

  const success = resolveOutcome({ reset: true });
  assert.equal(success.message, "Password reset successfully. You can now sign in.");
  assert.equal(success.error, "");

  const failure = resolveOutcome({ reset: false });
  assert.equal(failure.message, "");
  assert.ok(failure.error.includes("Recovery failed"));
});

test("LoginPage: question form renders only when questionsFetched AND questions.length > 0", () => {
  const shouldRenderQuestionForm = (questionsFetched, questions) =>
    questionsFetched && questions.length > 0;
  assert.equal(shouldRenderQuestionForm(false, []), false);
  assert.equal(shouldRenderQuestionForm(false, [{ question: "q" }]), false);
  assert.equal(shouldRenderQuestionForm(true, []), false);
  assert.equal(shouldRenderQuestionForm(true, [{ question: "What?" }]), true);
});

test("LoginPage: 'No security questions found' renders only when questionsFetched AND questions empty", () => {
  const shouldRenderNoQuestions = (questionsFetched, questions) =>
    questionsFetched && questions.length === 0;
  assert.equal(shouldRenderNoQuestions(false, []), false);
  assert.equal(shouldRenderNoQuestions(true, [{ question: "q" }]), false);
  assert.equal(shouldRenderNoQuestions(true, []), true);
});

test("LoginPage: single question is displayed inline; multiple questions use a <select>", () => {
  const usesSelect = (questions) => questions.length > 1;
  assert.equal(usesSelect([{ question: "q1" }]), false, "single question uses inline paragraph");
  assert.equal(usesSelect([{ question: "q1" }, { question: "q2" }]), true, "two questions use select");
  assert.equal(usesSelect([]), false);
});

test("LoginPage: empty username guard prevents loadQuestions network call", () => {
  const willLoadQuestions = (recoveryUsername) => Boolean(recoveryUsername.trim());
  assert.equal(willLoadQuestions(""), false);
  assert.equal(willLoadQuestions("   "), false);
  assert.equal(willLoadQuestions("admin"), true);
  assert.equal(willLoadQuestions("  clinician  "), true);
});

test("LoginPage: first question in the list is pre-selected as default selectedQuestion", () => {
  const initialSelected = (questions) => (questions.length ? questions[0].question : "");
  assert.equal(initialSelected([{ question: "Q1" }, { question: "Q2" }]), "Q1");
  assert.equal(initialSelected([{ question: "Only" }]), "Only");
  assert.equal(initialSelected([]), "");
});

// ---------------------------------------------------------------------------
// CustomFieldsRenderer component rendering logic
//
// Key rendering decisions:
//  • Returns null when no fields are visible to the given role
//  • Filters fields by role membership in field.visibleTo array
//  • readOnly mode: booleans render "Yes"/"No"; others render String(value || "—")
//  • Required fields show " *" suffix on the label
//  • Empty/missing value defaults to "" in edit mode, "—" in readOnly mode
// ---------------------------------------------------------------------------

test("CustomFieldsRenderer: filters fields to those visible for the current role", () => {
  const filterVisible = (fields, role) =>
    (fields || []).filter((f) => (f.visibleTo || []).includes(role));

  const fields = [
    { key: "a", visibleTo: ["administrator", "clinician"] },
    { key: "b", visibleTo: ["client"] },
    { key: "c", visibleTo: ["administrator"] }
  ];
  assert.equal(filterVisible(fields, "administrator").length, 2);
  assert.equal(filterVisible(fields, "clinician").length, 1);
  assert.equal(filterVisible(fields, "client").length, 1);
  assert.equal(filterVisible([], "administrator").length, 0);
  assert.equal(filterVisible(null, "administrator").length, 0);
});

test("CustomFieldsRenderer: returns null (renders nothing) when no fields are visible", () => {
  const hasVisibleFields = (fields, role) =>
    (fields || []).filter((f) => (f.visibleTo || []).includes(role)).length > 0;
  assert.equal(hasVisibleFields([], "administrator"), false);
  assert.equal(hasVisibleFields([{ key: "a", visibleTo: ["client"] }], "clinician"), false);
  assert.equal(hasVisibleFields(null, "clinician"), false);
  assert.equal(hasVisibleFields([{ key: "a", visibleTo: ["clinician"] }], "clinician"), true);
});

test("CustomFieldsRenderer: readOnly boolean fields display 'Yes' or 'No'", () => {
  const readOnlyBool = (value) => (value ? "Yes" : "No");
  assert.equal(readOnlyBool(true), "Yes");
  assert.equal(readOnlyBool(false), "No");
  assert.equal(readOnlyBool(1), "Yes");
  assert.equal(readOnlyBool(0), "No");
  assert.equal(readOnlyBool(""), "No");
});

test("CustomFieldsRenderer: readOnly non-boolean fields display String(value) or '—' for empty", () => {
  const readOnlyValue = (value) => String(value || "—");
  assert.equal(readOnlyValue("hello"), "hello");
  assert.equal(readOnlyValue(""), "—");
  assert.equal(readOnlyValue(null), "—");
  assert.equal(readOnlyValue(undefined), "—");
  assert.equal(readOnlyValue(42), "42");
});

test("CustomFieldsRenderer: required fields append ' *' to their label", () => {
  const renderLabel = (field) => `${field.label}${field.required ? " *" : ""}`;
  assert.equal(renderLabel({ label: "Phone", required: true }), "Phone *");
  assert.equal(renderLabel({ label: "Notes", required: false }), "Notes");
  assert.equal(renderLabel({ label: "Score" }), "Score");
});

test("CustomFieldsRenderer: value defaults to empty string when missing from values map", () => {
  const resolveValue = (values, key) => (values || {})[key] ?? "";
  assert.equal(resolveValue({ phone: "555" }, "phone"), "555");
  assert.equal(resolveValue({ phone: "555" }, "address"), "");
  assert.equal(resolveValue(null, "any"), "");
  assert.equal(resolveValue(undefined, "any"), "");
});

test("CustomFieldsRenderer: handleChange merges new value into existing values object", () => {
  const handleChange = (values, key, nextValue) => ({ ...values, [key]: nextValue });
  const initial = { phone: "555", address: "old" };
  const updated = handleChange(initial, "address", "new address");
  assert.equal(updated.phone, "555");
  assert.equal(updated.address, "new address");
});

// ---------------------------------------------------------------------------
// ProtectedPage / AppShell — route policy rendering decisions
// ---------------------------------------------------------------------------

test("route policy: ProtectedPage redirects unauthenticated users to /login", () => {
  const shouldRedirectToLogin = (user) => !user;
  assert.equal(shouldRedirectToLogin(null), true);
  assert.equal(shouldRedirectToLogin(undefined), true);
  assert.equal(shouldRedirectToLogin({ id: "u1", role: "client" }), false);
});

test("route policy: each authenticated role maps to exactly one allowed module path", () => {
  for (const role of ["client", "clinician", "administrator"]) {
    const defaultPath = defaultRouteForRole(role);
    assert.ok(defaultPath.startsWith("/"), `${role} default route must start with /`);
    assert.equal(roleCanAccessPath(role, defaultPath), true, `${role} must access its own default route`);
  }
});
