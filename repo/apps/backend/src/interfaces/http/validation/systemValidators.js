import { enforceAllowedKeys, requireNonEmptyString, requireObject } from "./requestValidation.js";

export function validateProfileFieldUpdate(req) {
  requireObject(req.body, "body");
  enforceAllowedKeys(req.body, ["profileFields", "reason"], "body");
  requireObject(req.body.profileFields, "profileFields");
  requireNonEmptyString(req.body.reason, "reason", 255);
}

export function validateBackupRun(req) {
  if (req.body && typeof req.body === "object" && !Array.isArray(req.body)) {
    enforceAllowedKeys(req.body, ["reason"], "body");
    if (req.body.reason !== undefined && req.body.reason !== null && req.body.reason !== "") {
      requireNonEmptyString(req.body.reason, "reason", 255);
    }
  }
}
