import { AppError } from "../errors/AppError.js";

export const userRoles = ["administrator", "clinician", "client"];
export const permissions = {
  piiView: "PII_VIEW",
  userManage: "USER_MANAGE",
  auditRead: "AUDIT_READ"
};

export class User {
  constructor(payload) {
    Object.assign(this, payload);
  }

  static validateRole(role) {
    if (!userRoles.includes(role)) {
      throw new AppError(
        `role must be one of: ${userRoles.join(", ")}`,
        400,
        "INVALID_ROLE"
      );
    }
  }

  static normalizeUsername(username) {
    if (typeof username !== "string" || !username.trim()) {
      throw new AppError("username is required", 400, "INVALID_USERNAME");
    }

    const normalized = username.trim().toLowerCase();
    if (!/^[a-z0-9_.-]{3,60}$/.test(normalized)) {
      throw new AppError(
        "username must be 3-60 chars and contain only letters, numbers, _, -, .",
        400,
        "INVALID_USERNAME"
      );
    }
    return normalized;
  }
}
