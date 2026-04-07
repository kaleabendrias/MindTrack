import test from "node:test";
import assert from "node:assert/strict";
import { buildSafeQueryRegex } from "../../apps/backend/src/application/services/MindTrackService.js";

test("buildSafeQueryRegex returns null for empty input", () => {
  assert.equal(buildSafeQueryRegex(""), null);
  assert.equal(buildSafeQueryRegex("   "), null);
  assert.equal(buildSafeQueryRegex(undefined), null);
  assert.equal(buildSafeQueryRegex(null), null);
});

test("buildSafeQueryRegex escapes regex metacharacters", () => {
  // The pattern below would either inject regex syntax or trigger
  // catastrophic backtracking if interpolated raw. After escaping, it
  // becomes a literal string.
  const dangerous = "(.*)+";
  const r = buildSafeQueryRegex(dangerous);
  assert.ok(r instanceof RegExp);
  // The escaped pattern must match the literal characters of the input
  // and NOT zero-or-more arbitrary characters.
  assert.ok(r.test("hello (.*)+"), "escaped regex must match literal text");
  assert.equal(r.test("hello world"), false, "escaped regex must NOT match arbitrary text");
});

test("buildSafeQueryRegex preserves case-insensitive matching", () => {
  const r = buildSafeQueryRegex("FOO");
  assert.ok(r.test("contains foo bar"));
  assert.ok(r.test("CONTAINS FOO"));
});

test("buildSafeQueryRegex escapes every metacharacter individually", () => {
  const meta = ".*+?^${}()|[]\\";
  const r = buildSafeQueryRegex(meta);
  assert.ok(r.test(`prefix ${meta} suffix`), "escaped meta sequence must match literally");
});

test("buildSafeQueryRegex rejects queries longer than 200 chars", () => {
  const long = "a".repeat(201);
  assert.throws(() => buildSafeQueryRegex(long), { code: "SEARCH_QUERY_TOO_LONG" });
});

test("buildSafeQueryRegex accepts queries up to 200 chars", () => {
  const ok = "a".repeat(200);
  const r = buildSafeQueryRegex(ok);
  assert.ok(r instanceof RegExp);
});

test("buildSafeQueryRegex rejects control characters and NUL", () => {
  assert.throws(() => buildSafeQueryRegex("foo\u0000bar"), { code: "SEARCH_QUERY_INVALID" });
  assert.throws(() => buildSafeQueryRegex("foo\u0007bar"), { code: "SEARCH_QUERY_INVALID" });
});

test("buildSafeQueryRegex does NOT throw for an evil pattern that previously caused catastrophic backtracking", () => {
  // This input is the canonical "evil regex" — `(a+)+` interpolated raw
  // would produce a regex that backtracks exponentially on input like
  // "aaaaaaaaaaaaaaaaaaaaaaaaa!". After escaping it becomes a literal
  // string and matching is O(n).
  const evil = "(a+)+";
  const r = buildSafeQueryRegex(evil);
  const start = Date.now();
  const target = "a".repeat(40) + "!";
  // Run the literal match — should complete in microseconds.
  assert.equal(r.test(target), false);
  assert.ok(Date.now() - start < 100, "literal match must complete almost instantly");
});
