import test from "node:test";
import assert from "node:assert/strict";
import { recentSearchStorageKey } from "../../apps/frontend/src/shared/utils/searchHistory.js";

test("recent search history is scoped by authenticated user identity", () => {
  assert.equal(recentSearchStorageKey("user-a"), "mindtrack_recent_queries_user-a");
  assert.equal(recentSearchStorageKey("user-b"), "mindtrack_recent_queries_user-b");
  assert.notEqual(recentSearchStorageKey("user-a"), recentSearchStorageKey("user-b"));
});
