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
