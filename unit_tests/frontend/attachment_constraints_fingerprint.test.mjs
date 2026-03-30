import test from "node:test";
import assert from "node:assert/strict";
import {
  validateAttachmentMeta
} from "../../apps/frontend/src/shared/utils/attachmentRules.js";
import { fingerprintFile } from "../../apps/frontend/src/shared/utils/fileFingerprint.js";

test("attachment constraints enforce type/size/count", () => {
  const tooLarge = validateAttachmentMeta([], [
    {
      name: "large.pdf",
      type: "application/pdf",
      sizeBytes: 11 * 1024 * 1024,
      fingerprint: "abc"
    }
  ]);
  assert.match(tooLarge, /10 MB/);

  const badType = validateAttachmentMeta([], [
    {
      name: "script.exe",
      type: "application/octet-stream",
      sizeBytes: 100,
      fingerprint: "def"
    }
  ]);
  assert.match(badType, /PDF, JPG and PNG/);

  const overflow = validateAttachmentMeta(
    Array.from({ length: 20 }).map((_, index) => ({
      name: `${index}.pdf`,
      type: "application/pdf",
      sizeBytes: 100,
      fingerprint: String(index)
    })),
    [{ name: "new.pdf", type: "application/pdf", sizeBytes: 100, fingerprint: "x" }]
  );
  assert.match(overflow, /Maximum 20/);
});

test("fingerprint duplicate prevention catches existing fingerprint", async () => {
  const blob = new Blob(["same-content"], { type: "application/pdf" });
  const fileA = new File([blob], "a.pdf", { type: "application/pdf" });
  const fileB = new File([blob], "b.pdf", { type: "application/pdf" });

  const fpA = await fingerprintFile(fileA);
  const fpB = await fingerprintFile(fileB);
  assert.equal(fpA, fpB);

  const duplicate = validateAttachmentMeta(
    [{ name: "a.pdf", type: "application/pdf", sizeBytes: fileA.size, fingerprint: fpA }],
    [{ name: "b.pdf", type: "application/pdf", sizeBytes: fileB.size, fingerprint: fpB }]
  );
  assert.match(duplicate, /Duplicate upload blocked/);
});
