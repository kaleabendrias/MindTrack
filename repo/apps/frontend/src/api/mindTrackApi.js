import { apiRequest } from "./client.js";

export async function fetchClients() {
  const response = await apiRequest("/mindtrack/clients");
  return response.data;
}

export async function fetchSelfContext() {
  const response = await apiRequest("/mindtrack/self-context");
  return response.data;
}

export async function createClient(payload) {
  const response = await apiRequest("/mindtrack/clients", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  return response.data;
}

export async function mergeClients(payload) {
  const response = await apiRequest("/mindtrack/clients/merge", {
    method: "POST",
    idempotencyKey: crypto.randomUUID(),
    body: JSON.stringify(payload)
  });
  return response.data;
}

export async function fetchTimeline(clientId) {
  const response = await apiRequest(`/mindtrack/clients/${clientId}/timeline`);
  return response.data;
}

export async function createEntry(payload) {
  const response = await apiRequest("/mindtrack/entries", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  return response.data;
}

export async function signEntry(entryId, expectedVersion, reason) {
  const response = await apiRequest(`/mindtrack/entries/${entryId}/sign`, {
    method: "POST",
    idempotencyKey: crypto.randomUUID(),
    body: JSON.stringify({ expectedVersion, reason })
  });
  return response.data;
}

export async function amendEntry(entryId, expectedVersion, body, reason) {
  const response = await apiRequest(`/mindtrack/entries/${entryId}/amend`, {
    method: "POST",
    idempotencyKey: crypto.randomUUID(),
    body: JSON.stringify({ expectedVersion, body, reason })
  });
  return response.data;
}

export async function restoreEntry(entryId, expectedVersion, reason) {
  const response = await apiRequest(`/mindtrack/entries/${entryId}/restore`, {
    method: "POST",
    idempotencyKey: crypto.randomUUID(),
    body: JSON.stringify({ expectedVersion, reason })
  });
  return response.data;
}

export async function searchEntries(params) {
  const urlParams = new URLSearchParams();
  if (params.q) {
    urlParams.set("q", params.q);
  }
  if (params.from) {
    urlParams.set("from", params.from);
  }
  if (params.to) {
    urlParams.set("to", params.to);
  }
  if (params.channel) {
    urlParams.set("channel", params.channel);
  }
  if (params.tags?.length) {
    urlParams.set("tags", params.tags.join(","));
  }
  if (params.sort) {
    urlParams.set("sort", params.sort);
  }

  const response = await apiRequest(`/mindtrack/search?${urlParams.toString()}`);
  return response.data;
}

export async function fetchTrendingTerms() {
  const response = await apiRequest("/mindtrack/search/trending");
  return response.data;
}

export async function fetchNearbyFacilities(clientId, radiusMiles = 25) {
  const params = new URLSearchParams({ clientId, radiusMiles: String(radiusMiles) });
  const response = await apiRequest(`/mindtrack/recommendations/nearby?${params.toString()}`);
  return response.data;
}

export async function updateClientProfile(clientId, payload) {
  const response = await apiRequest(`/mindtrack/clients/${clientId}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
  return response.data;
}

export async function updateClientGovernance(clientId, payload) {
  const response = await apiRequest(`/mindtrack/clients/${clientId}/governance`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
  return response.data;
}
