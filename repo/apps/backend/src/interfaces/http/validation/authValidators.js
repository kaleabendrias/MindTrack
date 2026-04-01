import {
  enforceAllowedKeys,
  requireNonEmptyString,
  requireObject
} from "./requestValidation.js";

export function validateLoginRequest(req) {
  requireObject(req.body, "body");
  enforceAllowedKeys(req.body, ["username", "password"], "body");
  requireNonEmptyString(req.body.username, "username", 60);
  requireNonEmptyString(req.body.password, "password", 255);
}

export function validateRefreshRequest(req) {
  if (!req.body || Object.keys(req.body).length === 0) {
    return;
  }
  requireObject(req.body, "body");
  enforceAllowedKeys(req.body, ["refreshToken"], "body");
  requireNonEmptyString(req.body.refreshToken, "refreshToken", 2000);
}

export function validateRecoveryRequest(req) {
  requireObject(req.body, "body");
  enforceAllowedKeys(req.body, ["username", "question", "answer", "newPassword"], "body");
  requireNonEmptyString(req.body.username, "username", 60);
  requireNonEmptyString(req.body.question, "question", 200);
  requireNonEmptyString(req.body.answer, "answer", 200);
  requireNonEmptyString(req.body.newPassword, "newPassword", 255);
}
