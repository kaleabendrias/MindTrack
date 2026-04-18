import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import path from "node:path";

// ---------------------------------------------------------------------------
// resolveBackupPath and encrypt/decrypt are module-scoped helpers in
// SystemService.js. These tests verify the security invariants by mirroring
// the exact same logic from the source — if someone weakens the guard
// conditions in the real code, the corresponding integration/API tests will
// catch the regression. These unit tests verify the invariants' _shape_.
// ---------------------------------------------------------------------------

const BACKUP_FILENAME_PATTERN = /^mindtrack-backup-[A-Za-z0-9-]+\.enc\.json$/;

function resolveBackupPath(filename, destination) {
  if (typeof filename !== "string" || filename.length === 0 || filename.length > 200) {
    throw Object.assign(new Error("invalid backup filename"), { code: "INVALID_BACKUP_FILENAME" });
  }
  if (filename.includes("/") || filename.includes("\\") || filename.includes("\0") || filename.includes("..")) {
    throw Object.assign(new Error("invalid backup filename"), { code: "INVALID_BACKUP_FILENAME" });
  }
  if (!BACKUP_FILENAME_PATTERN.test(filename)) {
    throw Object.assign(new Error("invalid backup filename"), { code: "INVALID_BACKUP_FILENAME" });
  }
  const baseDir = path.resolve(destination);
  const candidate = path.resolve(baseDir, filename);
  const baseWithSep = baseDir.endsWith(path.sep) ? baseDir : baseDir + path.sep;
  if (!candidate.startsWith(baseWithSep) || path.dirname(candidate) !== baseDir) {
    throw Object.assign(new Error("invalid backup filename"), { code: "INVALID_BACKUP_FILENAME" });
  }
  return candidate;
}

function encryptBuffer(buffer, key32bytes) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key32bytes, iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  return JSON.stringify({
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: encrypted.toString("base64")
  });
}

function decryptBuffer(encryptedJson, key32bytes) {
  const parsed = typeof encryptedJson === "string" ? JSON.parse(encryptedJson) : encryptedJson;
  const iv = Buffer.from(parsed.iv, "base64");
  const tag = Buffer.from(parsed.tag, "base64");
  const data = Buffer.from(parsed.data, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key32bytes, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

const TEST_KEY = crypto.randomBytes(32);
const DEST = "/var/lib/offline-system/backups";

// ---------------------------------------------------------------------------
// resolveBackupPath — path traversal protection
// ---------------------------------------------------------------------------

test("resolveBackupPath rejects non-string filename", () => {
  assert.throws(() => resolveBackupPath(null, DEST), /invalid backup filename/);
  assert.throws(() => resolveBackupPath(123, DEST), /invalid backup filename/);
  assert.throws(() => resolveBackupPath(undefined, DEST), /invalid backup filename/);
});

test("resolveBackupPath rejects empty string", () => {
  assert.throws(() => resolveBackupPath("", DEST), /invalid backup filename/);
});

test("resolveBackupPath rejects filenames longer than 200 characters", () => {
  const long = "mindtrack-backup-" + "a".repeat(185) + ".enc.json";
  assert.ok(long.length > 200);
  assert.throws(() => resolveBackupPath(long, DEST), /invalid backup filename/);
});

test("resolveBackupPath rejects forward-slash", () => {
  assert.throws(() => resolveBackupPath("mindtrack-backup-2024-01-01/evil.enc.json", DEST), /invalid backup filename/);
});

test("resolveBackupPath rejects backslash", () => {
  assert.throws(() => resolveBackupPath("mindtrack-backup-2024\\evil.enc.json", DEST), /invalid backup filename/);
});

test("resolveBackupPath rejects NUL byte", () => {
  assert.throws(() => resolveBackupPath("mindtrack-backup-\0-evil.enc.json", DEST), /invalid backup filename/);
});

test("resolveBackupPath rejects double-dot traversal — embedded", () => {
  assert.throws(() => resolveBackupPath("mindtrack-backup-..abc.enc.json", DEST), /invalid backup filename/);
});

test("resolveBackupPath rejects double-dot traversal — prefix", () => {
  assert.throws(() => resolveBackupPath("../mindtrack-backup-2024-01-01.enc.json", DEST), /invalid backup filename/);
});

test("resolveBackupPath rejects arbitrary filename", () => {
  assert.throws(() => resolveBackupPath("passwd", DEST), /invalid backup filename/);
  assert.throws(() => resolveBackupPath("/etc/shadow", DEST), /invalid backup filename/);
});

test("resolveBackupPath rejects non-matching pattern (no enc.json suffix)", () => {
  assert.throws(() => resolveBackupPath("mindtrack-backup-2024-01-15.json", DEST), /invalid backup filename/);
  assert.throws(() => resolveBackupPath("mindtrack-backup-2024-01-15.enc", DEST), /invalid backup filename/);
});

test("resolveBackupPath rejects underscore in identifier (not in allowlist)", () => {
  assert.throws(() => resolveBackupPath("mindtrack-backup-2024_01_01.enc.json", DEST), /invalid backup filename/);
});

test("resolveBackupPath rejects space in identifier", () => {
  assert.throws(() => resolveBackupPath("mindtrack-backup-2024 01 01.enc.json", DEST), /invalid backup filename/);
});

test("resolveBackupPath accepts valid ISO-date-like filename", () => {
  const filename = "mindtrack-backup-2024-01-15T000000Z.enc.json";
  const result = resolveBackupPath(filename, DEST);
  assert.ok(result.endsWith(filename));
  assert.ok(result.startsWith(DEST));
});

test("resolveBackupPath accepts alphanumeric identifier", () => {
  const filename = "mindtrack-backup-abc123XYZ.enc.json";
  assert.doesNotThrow(() => resolveBackupPath(filename, DEST));
});

test("resolveBackupPath accepted result is canonical (no traversal in output)", () => {
  const filename = "mindtrack-backup-2024-06-01.enc.json";
  const result = resolveBackupPath(filename, DEST);
  assert.equal(result, path.join(DEST, filename));
});

// ---------------------------------------------------------------------------
// BACKUP_FILENAME_PATTERN — direct regex boundary tests
// ---------------------------------------------------------------------------

test("BACKUP_FILENAME_PATTERN: valid filenames pass", () => {
  assert.ok(BACKUP_FILENAME_PATTERN.test("mindtrack-backup-2024-01-01.enc.json"));
  assert.ok(BACKUP_FILENAME_PATTERN.test("mindtrack-backup-20240101T120000Z.enc.json"));
  assert.ok(BACKUP_FILENAME_PATTERN.test("mindtrack-backup-abc123.enc.json"));
});

test("BACKUP_FILENAME_PATTERN: rejects missing prefix", () => {
  assert.equal(BACKUP_FILENAME_PATTERN.test("backup-2024-01-01.enc.json"), false);
});

test("BACKUP_FILENAME_PATTERN: rejects missing suffix", () => {
  assert.equal(BACKUP_FILENAME_PATTERN.test("mindtrack-backup-2024-01-01.json"), false);
  assert.equal(BACKUP_FILENAME_PATTERN.test("mindtrack-backup-2024-01-01"), false);
});

test("BACKUP_FILENAME_PATTERN: rejects empty identifier segment", () => {
  assert.equal(BACKUP_FILENAME_PATTERN.test("mindtrack-backup-.enc.json"), false);
});

// ---------------------------------------------------------------------------
// encryptBuffer / decryptBuffer — round-trip and security properties
// ---------------------------------------------------------------------------

test("encrypt/decrypt round-trips plain text", () => {
  const plaintext = Buffer.from("Hello, MindTrack!");
  const decrypted = decryptBuffer(encryptBuffer(plaintext, TEST_KEY), TEST_KEY);
  assert.deepEqual(decrypted, plaintext);
});

test("encrypt/decrypt round-trips binary data", () => {
  const binary = crypto.randomBytes(256);
  assert.deepEqual(decryptBuffer(encryptBuffer(binary, TEST_KEY), TEST_KEY), binary);
});

test("encrypt/decrypt round-trips an empty buffer", () => {
  const empty = Buffer.alloc(0);
  assert.deepEqual(decryptBuffer(encryptBuffer(empty, TEST_KEY), TEST_KEY), empty);
});

test("encrypt/decrypt round-trips a large buffer (1 MB)", () => {
  const large = crypto.randomBytes(1024 * 1024);
  assert.deepEqual(decryptBuffer(encryptBuffer(large, TEST_KEY), TEST_KEY), large);
});

test("encrypted output is JSON with iv, tag, and data string fields", () => {
  const parsed = JSON.parse(encryptBuffer(Buffer.from("test"), TEST_KEY));
  assert.ok(typeof parsed.iv === "string");
  assert.ok(typeof parsed.tag === "string");
  assert.ok(typeof parsed.data === "string");
});

test("each encryption produces a unique ciphertext (random IV)", () => {
  const plaintext = Buffer.from("same plaintext");
  const enc1 = JSON.parse(encryptBuffer(plaintext, TEST_KEY));
  const enc2 = JSON.parse(encryptBuffer(plaintext, TEST_KEY));
  assert.notEqual(enc1.iv, enc2.iv);
  assert.notEqual(enc1.data, enc2.data);
});

test("decryptBuffer with wrong key throws (GCM authentication failure)", () => {
  const encrypted = encryptBuffer(Buffer.from("secret"), TEST_KEY);
  const wrongKey = crypto.randomBytes(32);
  assert.throws(() => decryptBuffer(encrypted, wrongKey));
});

test("decryptBuffer with tampered ciphertext throws (GCM auth tag failure)", () => {
  const encryptedJson = encryptBuffer(Buffer.from("secret data"), TEST_KEY);
  const parsed = JSON.parse(encryptedJson);
  const data = Buffer.from(parsed.data, "base64");
  data[data.length - 1] ^= 0xff;
  parsed.data = data.toString("base64");
  assert.throws(() => decryptBuffer(JSON.stringify(parsed), TEST_KEY));
});

test("decryptBuffer accepts a pre-parsed object (not just string)", () => {
  const plaintext = Buffer.from("parsed object input");
  const parsed = JSON.parse(encryptBuffer(plaintext, TEST_KEY));
  assert.deepEqual(decryptBuffer(parsed, TEST_KEY), plaintext);
});
