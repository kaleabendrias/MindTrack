import { apiRequest } from "./client.js";

export async function fetchUsers() {
  const response = await apiRequest("/users");
  return response.data;
}

export async function adminResetPassword(userId, newPassword, reason) {
  const response = await apiRequest(`/users/${userId}/reset-password`, {
    method: "POST",
    body: JSON.stringify({ newPassword, reason })
  });
  return response.data;
}
