export function canAccessRole(currentRole, targetRole) {
  if (!currentRole || !targetRole) {
    return false;
  }
  if (currentRole === "administrator") {
    return true;
  }
  return currentRole === targetRole;
}

export function statusCue(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "draft") {
    return "badge--draft";
  }
  if (normalized === "signed") {
    return "badge--signed";
  }
  if (normalized === "amended") {
    return "badge--amended";
  }
  return "badge--queued";
}

export function validateTimelineEntry(input) {
  const errors = {};
  if (!input.clientId) {
    errors.clientId = "Client is required";
  }
  if (!String(input.title || "").trim()) {
    errors.title = "Title is required";
  }
  if (!String(input.body || "").trim()) {
    errors.body = "Body is required";
  }
  return errors;
}

export function deriveSearchSuggestionState(recentQueries, trendingTerms) {
  return {
    recent: Array.from(new Set((recentQueries || []).filter(Boolean))).slice(0, 10),
    trending: (trendingTerms || []).slice(0, 12)
  };
}
