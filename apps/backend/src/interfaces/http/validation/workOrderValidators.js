import {
  enforceAllowedKeys,
  requireEnum,
  requireNonEmptyString,
  requireObject
} from "./requestValidation.js";

export function validateWorkOrderCreate(req) {
  requireObject(req.body, "body");
  enforceAllowedKeys(req.body, ["title", "description", "assignedRole", "reason"], "body");
  requireNonEmptyString(req.body.title, "title", 120);
  requireNonEmptyString(req.body.description, "description", 500);
  requireEnum(req.body.assignedRole, "assignedRole", ["admin", "operator"]);
}

export function validateWorkOrderUpdateStatus(req) {
  if (!/^[a-f0-9]{24,32}$/i.test(req.params.id || "")) {
    throw new Error("invalid work order id");
  }

  requireObject(req.body, "body");
  enforceAllowedKeys(req.body, ["status", "reason"], "body");
  requireEnum(req.body.status, "status", ["queued", "in_progress", "done"]);
}

export function validateWorkOrderDelete(req) {
  if (!/^[a-f0-9]{24,32}$/i.test(req.params.id || "")) {
    throw new Error("invalid work order id");
  }

  requireObject(req.body, "body");
  enforceAllowedKeys(req.body, ["reason"], "body");
  requireNonEmptyString(req.body.reason, "reason", 255);
}
