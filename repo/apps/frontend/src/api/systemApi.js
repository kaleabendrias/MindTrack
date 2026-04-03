import { apiRequest } from "./client.js";

export async function fetchBackupStatus() {
  const response = await apiRequest("/system/backup-status");
  return response.data;
}

export async function runBackupNow(reason) {
  const response = await apiRequest("/system/backup-run", {
    method: "POST",
    body: JSON.stringify({ reason })
  });
  return response.data;
}

export async function fetchOfflinePolicy() {
  const response = await apiRequest("/system/offline-policy");
  return response.data;
}

export async function fetchProfileFields() {
  const response = await apiRequest("/system/profile-fields");
  return response.data;
}

export async function updateProfileFields(profileFields, reason) {
  const response = await apiRequest("/system/profile-fields", {
    method: "PATCH",
    body: JSON.stringify({ profileFields, reason })
  });
  return response.data;
}

export async function addCustomProfileField(field, reason) {
  const response = await apiRequest("/system/profile-fields/custom", {
    method: "POST",
    body: JSON.stringify({ field, reason })
  });
  return response.data;
}

export async function updateCustomProfileField(key, updates, reason) {
  const response = await apiRequest(`/system/profile-fields/custom/${encodeURIComponent(key)}`, {
    method: "PATCH",
    body: JSON.stringify({ updates, reason })
  });
  return response.data;
}

export async function deleteCustomProfileField(key, reason) {
  const response = await apiRequest(`/system/profile-fields/custom/${encodeURIComponent(key)}`, {
    method: "DELETE",
    body: JSON.stringify({ reason })
  });
  return response.data;
}
