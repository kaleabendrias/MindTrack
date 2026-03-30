import test from "node:test";
import assert from "node:assert/strict";
import {
  clearSessionState,
  getSessionState,
  setSessionState
} from "../../apps/frontend/src/api/client.js";

test("session state is memory-only and clears on logout/reset", () => {
  clearSessionState();
  assert.equal(getSessionState(), null);

  setSessionState({ user: { username: "client" }, csrfToken: "csrf-1" });
  assert.equal(getSessionState().csrfToken, "csrf-1");

  clearSessionState();
  assert.equal(getSessionState(), null);
});
