import test from "node:test";
import assert from "node:assert/strict";
import { hasPiiViewPermission, maskPhone, maskAddress, displayPii } from "../../apps/frontend/src/shared/utils/piiUtils.js";

test("hasPiiViewPermission returns true only when PII_VIEW present", () => {
  assert.equal(hasPiiViewPermission({ permissions: ["PII_VIEW"] }), true);
  assert.equal(hasPiiViewPermission({ permissions: ["PII_VIEW", "USER_MANAGE"] }), true);
  assert.equal(hasPiiViewPermission({ permissions: [] }), false);
  assert.equal(hasPiiViewPermission({ permissions: ["USER_MANAGE"] }), false);
  assert.equal(hasPiiViewPermission(null), false);
  assert.equal(hasPiiViewPermission(undefined), false);
  assert.equal(hasPiiViewPermission({}), false);
});

test("maskPhone masks all but last 4 digits", () => {
  assert.equal(maskPhone("+1-555-0100"), "*******0100");
  assert.equal(maskPhone("1234"), "****");
  assert.equal(maskPhone("123"), "***");
  assert.equal(maskPhone(""), "");
  assert.equal(maskPhone(null), "");
  assert.equal(maskPhone(undefined), "");
});

test("maskAddress replaces any value with masked placeholder", () => {
  assert.equal(maskAddress("100 Main St"), "***masked***");
  assert.equal(maskAddress(""), "");
  assert.equal(maskAddress(null), "");
  assert.equal(maskAddress(undefined), "");
});

test("displayPii shows real value when permitted, masked otherwise", () => {
  assert.equal(displayPii("+1-555-0100", true, maskPhone), "+1-555-0100");
  assert.equal(displayPii("+1-555-0100", false, maskPhone), "*******0100");
  assert.equal(displayPii("100 Main St", true, maskAddress), "100 Main St");
  assert.equal(displayPii("100 Main St", false, maskAddress), "***masked***");
  assert.equal(displayPii("", true, maskPhone), "");
  assert.equal(displayPii(null, false, maskPhone), "");
});

test("administrator user has PII_VIEW, clinician and client do not", () => {
  const admin = { permissions: ["PII_VIEW", "USER_MANAGE", "AUDIT_READ"] };
  const clinician = { permissions: [] };
  const client = { permissions: [] };

  assert.equal(hasPiiViewPermission(admin), true);
  assert.equal(hasPiiViewPermission(clinician), false);
  assert.equal(hasPiiViewPermission(client), false);
});
