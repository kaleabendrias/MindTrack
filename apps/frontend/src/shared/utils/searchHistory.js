export function recentSearchStorageKey(userKey) {
  return `mindtrack_recent_queries_${userKey || "anonymous"}`;
}
