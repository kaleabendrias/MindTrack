import test from "node:test";
import assert from "node:assert/strict";
import {
  validateAttachmentMeta,
  MAX_ATTACHMENT_SIZE_BYTES,
  MAX_ATTACHMENTS_PER_ENTRY,
  ALLOWED_ATTACHMENT_TYPES
} from "../../apps/frontend/src/shared/utils/attachmentRules.js";
import {
  hasPiiViewPermission,
  maskPhone,
  maskAddress,
  displayPii
} from "../../apps/frontend/src/shared/utils/piiUtils.js";
import { validatePassword } from "../../apps/frontend/src/shared/utils/passwordPolicy.js";
import { recentSearchStorageKey } from "../../apps/frontend/src/shared/utils/searchHistory.js";
import {
  canAccessRole,
  statusCue,
  validateTimelineEntry,
  deriveSearchSuggestionState
} from "../../apps/frontend/src/app/roleLogic.js";
import {
  defaultRouteForRole,
  roleCanAccessPath
} from "../../apps/frontend/src/app/routePolicy.js";

// ---------------------------------------------------------------------------
// Attachment rules — boundary conditions that drive component rendering
// ---------------------------------------------------------------------------

test("attachment count: exactly 20 files is allowed, 21 is rejected", () => {
  const existing = Array.from({ length: 19 }, (_, i) => ({
    fingerprint: `fp${i}`,
    type: "image/png",
    sizeBytes: 100
  }));
  const incoming = [{ fingerprint: "fp19", type: "image/png", sizeBytes: 100 }];
  assert.equal(validateAttachmentMeta(existing, incoming), "", "20 total must be accepted");

  const overflow = [
    { fingerprint: "fp19a", type: "image/png", sizeBytes: 100 },
    { fingerprint: "fp19b", type: "image/png", sizeBytes: 100 }
  ];
  const err = validateAttachmentMeta(existing, overflow);
  assert.ok(err.length > 0, "21 total must be rejected");
  assert.match(err, /20/);
});

test("attachment type: only PDF/JPEG/PNG are allowed", () => {
  const pdf = [{ fingerprint: "f1", type: "application/pdf", sizeBytes: 100 }];
  assert.equal(validateAttachmentMeta([], pdf), "", "PDF must be allowed");

  const jpeg = [{ fingerprint: "f2", type: "image/jpeg", sizeBytes: 100 }];
  assert.equal(validateAttachmentMeta([], jpeg), "", "JPEG must be allowed");

  const png = [{ fingerprint: "f3", type: "image/png", sizeBytes: 100 }];
  assert.equal(validateAttachmentMeta([], png), "", "PNG must be allowed");

  const svg = [{ fingerprint: "f4", type: "image/svg+xml", sizeBytes: 100 }];
  const svgErr = validateAttachmentMeta([], svg);
  assert.ok(svgErr.length > 0, "SVG must be rejected");

  const mp4 = [{ fingerprint: "f5", type: "video/mp4", sizeBytes: 100 }];
  assert.ok(validateAttachmentMeta([], mp4).length > 0, "MP4 must be rejected");
});

test("attachment size: exactly at limit is accepted, one byte over is rejected", () => {
  const atLimit = [{ fingerprint: "f1", type: "image/png", sizeBytes: MAX_ATTACHMENT_SIZE_BYTES }];
  assert.equal(validateAttachmentMeta([], atLimit), "", "exactly at 10 MB limit must be accepted");

  const overLimit = [{ fingerprint: "f2", type: "image/png", sizeBytes: MAX_ATTACHMENT_SIZE_BYTES + 1 }];
  const err = validateAttachmentMeta([], overLimit);
  assert.ok(err.length > 0, "one byte over 10 MB must be rejected");
  assert.match(err, /10 MB/);
});

test("attachment fingerprint: duplicate upload within same batch is blocked", () => {
  const duplicateBatch = [
    { fingerprint: "dup01", type: "image/png", sizeBytes: 100 },
    { fingerprint: "dup01", type: "image/png", sizeBytes: 100 }
  ];
  const err = validateAttachmentMeta([], duplicateBatch);
  assert.ok(err.length > 0, "duplicate fingerprint within incoming batch must be blocked");
  assert.match(err, /[Dd]uplicate/);
});

test("attachment fingerprint: duplicate against already-uploaded files is blocked", () => {
  const existing = [{ fingerprint: "existing01", type: "image/png", sizeBytes: 100 }];
  const incoming = [{ fingerprint: "existing01", type: "image/png", sizeBytes: 100 }];
  const err = validateAttachmentMeta(existing, incoming);
  assert.ok(err.length > 0, "fingerprint collision with existing upload must be blocked");
});

test("attachment: empty incoming list with existing files is always valid", () => {
  const existing = Array.from({ length: 20 }, (_, i) => ({
    fingerprint: `fp${i}`,
    type: "image/png",
    sizeBytes: 100
  }));
  assert.equal(validateAttachmentMeta(existing, []), "", "no new uploads is always valid");
  assert.equal(validateAttachmentMeta([], []), "", "empty state is valid");
});

test("ALLOWED_ATTACHMENT_TYPES constant contains exactly PDF, JPEG, PNG", () => {
  assert.ok(ALLOWED_ATTACHMENT_TYPES.includes("application/pdf"));
  assert.ok(ALLOWED_ATTACHMENT_TYPES.includes("image/jpeg"));
  assert.ok(ALLOWED_ATTACHMENT_TYPES.includes("image/png"));
  assert.equal(ALLOWED_ATTACHMENT_TYPES.length, 3);
});

test("MAX_ATTACHMENTS_PER_ENTRY is 20 and MAX_ATTACHMENT_SIZE_BYTES is 10 MB", () => {
  assert.equal(MAX_ATTACHMENTS_PER_ENTRY, 20);
  assert.equal(MAX_ATTACHMENT_SIZE_BYTES, 10 * 1024 * 1024);
});

// ---------------------------------------------------------------------------
// PII masking — component display logic
// ---------------------------------------------------------------------------

test("hasPiiViewPermission: user with PII_VIEW permission returns true", () => {
  assert.equal(hasPiiViewPermission({ permissions: ["PII_VIEW", "OTHER"] }), true);
  assert.equal(hasPiiViewPermission({ permissions: ["PII_VIEW"] }), true);
  assert.equal(hasPiiViewPermission({ permissions: [] }), false);
  assert.equal(hasPiiViewPermission({ permissions: ["OTHER"] }), false);
  assert.equal(hasPiiViewPermission(null), false);
  assert.equal(hasPiiViewPermission(undefined), false);
  assert.equal(hasPiiViewPermission({}), false);
});

test("maskPhone: reveals only last 4 digits", () => {
  const result = maskPhone("+1-555-867-5309");
  assert.ok(result.endsWith("5309"), "last 4 digits must be visible");
  assert.ok(!result.includes("555"), "middle digits must be masked");
  assert.ok(!result.includes("867"), "exchange must be masked");
});

test("maskPhone: short values (4 chars or fewer) are fully masked", () => {
  assert.equal(maskPhone("5309"), "****");
  assert.equal(maskPhone("123"), "***");
  assert.equal(maskPhone(""), "");
  assert.equal(maskPhone(null), "");
});

test("maskAddress: always returns the masked sentinel string", () => {
  assert.equal(maskAddress("123 Main St"), "***masked***");
  assert.equal(maskAddress(""), "");
  assert.equal(maskAddress(null), "");
});

test("displayPii: shows raw value when canView is true, masked when false", () => {
  const raw = "+1-555-867-5309";
  assert.equal(displayPii(raw, true, maskPhone), raw);
  assert.notEqual(displayPii(raw, false, maskPhone), raw);
  assert.ok(displayPii(raw, false, maskPhone).endsWith("5309"));

  assert.equal(displayPii("123 Main St", true, maskAddress), "123 Main St");
  assert.equal(displayPii("123 Main St", false, maskAddress), "***masked***");
});

// ---------------------------------------------------------------------------
// Password policy — controls component-level validation feedback
// ---------------------------------------------------------------------------

test("validatePassword: accepts strong passwords", () => {
  assert.equal(validatePassword("SecurePass2026!"), null);
  assert.equal(validatePassword("abcdefghijkl1"), null);
  assert.equal(validatePassword("123456789012a"), null);
});

test("validatePassword: rejects passwords shorter than 12 characters", () => {
  const err = validatePassword("Short1");
  assert.ok(typeof err === "string", "short password must return an error string");
  assert.match(err, /12/);
});

test("validatePassword: rejects passwords with no letters", () => {
  const err = validatePassword("123456789012");
  assert.ok(typeof err === "string");
  assert.match(err, /letter/i);
});

test("validatePassword: rejects passwords with no digits", () => {
  const err = validatePassword("abcdefghijklm");
  assert.ok(typeof err === "string");
  assert.match(err, /number/i);
});

test("validatePassword: rejects non-string inputs", () => {
  assert.ok(validatePassword(null) !== null);
  assert.ok(validatePassword(undefined) !== null);
  assert.ok(validatePassword(12345678901) !== null);
});

// ---------------------------------------------------------------------------
// Search history — user-scoped storage key isolation
// ---------------------------------------------------------------------------

test("recentSearchStorageKey: keys are distinct per user", () => {
  const keyA = recentSearchStorageKey("user_a");
  const keyB = recentSearchStorageKey("user_b");
  assert.notEqual(keyA, keyB, "different users must get different storage keys");
});

test("recentSearchStorageKey: anonymous key is stable", () => {
  const key1 = recentSearchStorageKey(null);
  const key2 = recentSearchStorageKey(undefined);
  const key3 = recentSearchStorageKey("");
  assert.equal(key1, key2);
  assert.equal(key2, key3);
  assert.match(key1, /anonymous/);
});

test("recentSearchStorageKey: key contains the user identifier", () => {
  const key = recentSearchStorageKey("clinician_abc");
  assert.ok(key.includes("clinician_abc"), "key must embed the user identifier");
});

// ---------------------------------------------------------------------------
// Role logic — drives what each role's component view renders
// ---------------------------------------------------------------------------

test("statusCue: returns the correct badge class for all entry states", () => {
  assert.equal(statusCue("draft"), "badge--draft");
  assert.equal(statusCue("signed"), "badge--signed");
  assert.equal(statusCue("amended"), "badge--amended");
  assert.equal(statusCue("queued"), "badge--queued");
  assert.equal(statusCue("DRAFT"), "badge--draft");
  assert.equal(statusCue("SIGNED"), "badge--signed");
  assert.equal(statusCue("AMENDED"), "badge--amended");
  assert.equal(statusCue(null), "badge--queued");
  assert.equal(statusCue(undefined), "badge--queued");
  assert.equal(statusCue("unknown_state"), "badge--queued");
});

test("validateTimelineEntry: body and title must not be whitespace-only", () => {
  const errors = validateTimelineEntry({ clientId: "cli001", title: "   ", body: "\t\n" });
  assert.ok(errors.title, "whitespace-only title must be flagged");
  assert.ok(errors.body, "whitespace-only body must be flagged");
});

test("validateTimelineEntry: missing clientId is flagged separately from title/body", () => {
  const allMissing = validateTimelineEntry({ clientId: "", title: "", body: "" });
  assert.ok(allMissing.clientId);
  assert.ok(allMissing.title);
  assert.ok(allMissing.body);

  const onlyClientMissing = validateTimelineEntry({ clientId: "", title: "Valid", body: "Valid body text" });
  assert.ok(onlyClientMissing.clientId);
  assert.equal(onlyClientMissing.title, undefined);
  assert.equal(onlyClientMissing.body, undefined);
});

test("deriveSearchSuggestionState: deduplicates and caps recent at 10", () => {
  const recent = ["a", "b", "a", "c", "d", "e", "f", "g", "h", "i", "j", "k"];
  const state = deriveSearchSuggestionState(recent, []);
  assert.equal(state.recent.length, 10);
  assert.equal(new Set(state.recent).size, state.recent.length, "deduplication must be applied");
});

test("deriveSearchSuggestionState: trending is not capped by recent-query logic", () => {
  const trending = Array.from({ length: 12 }, (_, i) => ({ term: `t${i}`, count: i }));
  const state = deriveSearchSuggestionState([], trending);
  assert.equal(state.trending.length, 12);
});

// ---------------------------------------------------------------------------
// Route policy — determines which navigation items each role sees
// ---------------------------------------------------------------------------

test("defaultRouteForRole: each role maps to its dedicated route", () => {
  assert.equal(defaultRouteForRole("client"), "/client");
  assert.equal(defaultRouteForRole("clinician"), "/clinician");
  assert.equal(defaultRouteForRole("administrator"), "/administrator");
});

test("roleCanAccessPath: cross-role access is always denied", () => {
  const pairs = [
    ["client", "/clinician"],
    ["client", "/administrator"],
    ["clinician", "/client"],
    ["clinician", "/administrator"],
    ["administrator", "/client"],
    ["administrator", "/clinician"]
  ];
  for (const [role, path] of pairs) {
    assert.equal(
      roleCanAccessPath(role, path),
      false,
      `${role} must not access ${path}`
    );
  }
});

test("roleCanAccessPath: each role can only access its own path", () => {
  assert.equal(roleCanAccessPath("client", "/client"), true);
  assert.equal(roleCanAccessPath("clinician", "/clinician"), true);
  assert.equal(roleCanAccessPath("administrator", "/administrator"), true);
});

test("canAccessRole: administrator can access any module", () => {
  assert.equal(canAccessRole("administrator", "client"), true);
  assert.equal(canAccessRole("administrator", "clinician"), true);
  assert.equal(canAccessRole("administrator", "administrator"), true);
});

test("canAccessRole: non-admin roles are strictly self-scoped", () => {
  assert.equal(canAccessRole("clinician", "client"), false);
  assert.equal(canAccessRole("clinician", "administrator"), false);
  assert.equal(canAccessRole("client", "clinician"), false);
  assert.equal(canAccessRole("client", "administrator"), false);
  assert.equal(canAccessRole("client", "client"), true);
  assert.equal(canAccessRole("clinician", "clinician"), true);
});
