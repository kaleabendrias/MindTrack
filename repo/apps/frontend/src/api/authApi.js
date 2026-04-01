import { logger } from "../shared/utils/diagnosticLogger.js";
import { apiRequest, clearSessionState, setSessionState } from "./client.js";

export async function login(username, password) {
  logger.info("auth", "login attempt", { username });
  const response = await apiRequest("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password })
  });

  setSessionState(response.data);
  logger.info("auth", "login success", { role: response.data.user?.role });
  return response.data;
}

export async function fetchSession() {
  const response = await apiRequest("/auth/session", { method: "GET" });
  setSessionState(response.data);
  return response.data;
}

export async function logout() {
  logger.info("auth", "logout");
  try {
    await apiRequest("/auth/logout", {
      method: "POST",
      body: JSON.stringify({})
    });
  } finally {
    clearSessionState();
  }
}
