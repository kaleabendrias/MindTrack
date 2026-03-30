import {
  enforceAllowedKeys,
  requireEnum,
  requireNonEmptyString,
  requireObject
} from "./requestValidation.js";

export function validateUserCreate(req) {
  requireObject(req.body, "body");
  enforceAllowedKeys(
    req.body,
    [
      "username",
      "password",
      "role",
      "phone",
      "address",
      "securityQuestions",
      "reason"
    ],
    "body"
  );

  requireNonEmptyString(req.body.username, "username", 60);
  requireNonEmptyString(req.body.password, "password", 255);
  requireEnum(req.body.role, "role", ["administrator", "clinician", "client"]);

  if (!Array.isArray(req.body.securityQuestions) || req.body.securityQuestions.length === 0) {
    throw new Error("securityQuestions must be a non-empty array");
  }

  for (const item of req.body.securityQuestions) {
    requireObject(item, "securityQuestions item");
    enforceAllowedKeys(item, ["question", "answer"], "securityQuestions item");
    requireNonEmptyString(item.question, "security question", 200);
    requireNonEmptyString(item.answer, "security answer", 200);
  }
}

export function validateAdminReset(req) {
  if (!/^[a-f0-9]{24,32}$/i.test(req.params.id || "")) {
    throw new Error("invalid user id");
  }

  requireObject(req.body, "body");
  enforceAllowedKeys(req.body, ["newPassword", "reason"], "body");
  requireNonEmptyString(req.body.newPassword, "newPassword", 255);
  requireNonEmptyString(req.body.reason, "reason", 255);
}
