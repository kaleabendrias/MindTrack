import { apiRequest } from "./client.js";

export async function fetchUsers() {
  const response = await apiRequest("/users");
  return response.data;
}
