import test from "node:test";
import assert from "node:assert/strict";
import {
  redactObject,
  redactValue,
  logger,
  setLogLevel
} from "../../apps/frontend/src/shared/utils/diagnosticLogger.js";

test("redactValue masks sensitive keys", () => {
  assert.equal(redactValue("password", "secret123"), "***redacted***");
  assert.equal(redactValue("newPassword", "new123"), "***redacted***");
  assert.equal(redactValue("accessToken", "tok_abc"), "***redacted***");
  assert.equal(redactValue("refreshToken", "ref_abc"), "***redacted***");
  assert.equal(redactValue("csrfToken", "csrf_abc"), "***redacted***");
  assert.equal(redactValue("requestSigningKey", "key_abc"), "***redacted***");
  assert.equal(redactValue("secret", "shh"), "***redacted***");
  assert.equal(redactValue("answer", "my-answer"), "***redacted***");
  assert.equal(redactValue("cookie", "session=abc"), "***redacted***");
});

test("redactValue preserves non-sensitive keys", () => {
  assert.equal(redactValue("username", "admin"), "admin");
  assert.equal(redactValue("role", "clinician"), "clinician");
  assert.equal(redactValue("status", 200), 200);
});

test("redactValue redacts SSN patterns in string values", () => {
  const result = redactValue("note", "SSN is 123-45-6789 in file");
  assert.equal(result, "SSN is ***redacted*** in file");
});

test("redactValue redacts email patterns in string values", () => {
  const result = redactValue("comment", "Contact user@example.com for info");
  assert.equal(result, "Contact ***redacted*** for info");
});

test("redactObject deep-redacts nested objects", () => {
  const input = {
    username: "admin",
    password: "secret",
    nested: {
      accessToken: "tok_abc",
      role: "administrator"
    },
    list: [{ csrfToken: "csrf_abc" }]
  };
  const result = redactObject(input);
  assert.equal(result.username, "admin");
  assert.equal(result.password, "***redacted***");
  assert.equal(result.nested.accessToken, "***redacted***");
  assert.equal(result.nested.role, "administrator");
  assert.equal(result.list[0].csrfToken, "***redacted***");
});

test("redactObject handles null, undefined, and primitives", () => {
  assert.equal(redactObject(null), null);
  assert.equal(redactObject(undefined), undefined);
  assert.equal(redactObject(42), 42);
  assert.equal(redactObject("hello"), "hello");
});

test("logger methods exist and do not throw", () => {
  assert.doesNotThrow(() => logger.debug("test", "debug message"));
  assert.doesNotThrow(() => logger.info("test", "info message"));
  assert.doesNotThrow(() => logger.warn("test", "warn message"));
  assert.doesNotThrow(() => logger.error("test", "error message"));
});

test("logger methods accept data parameter with redaction", () => {
  assert.doesNotThrow(() =>
    logger.info("test", "login", { username: "admin", password: "secret" })
  );
});

test("setLogLevel changes minimum log level", () => {
  assert.doesNotThrow(() => setLogLevel("debug"));
  assert.doesNotThrow(() => setLogLevel("error"));
  assert.doesNotThrow(() => setLogLevel("info"));
  assert.doesNotThrow(() => setLogLevel("invalid"));
});

test("logger categories are passed through correctly", () => {
  const categories = ["auth", "api", "navigation", "state"];
  for (const category of categories) {
    assert.doesNotThrow(() => logger.info(category, "test message"));
  }
});
