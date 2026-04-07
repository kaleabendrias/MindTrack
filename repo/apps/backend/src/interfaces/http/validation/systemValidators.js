import { AppError } from "../../../domain/errors/AppError.js";
import {
  enforceAllowedKeys,
  requireEnum,
  requireNonEmptyString,
  requireObject
} from "./requestValidation.js";

const FIELD_KEY_PATTERN = /^[a-z0-9_]{2,40}$/;
const FIELD_TYPES = ["text", "number", "date", "boolean", "select"];
const VISIBLE_ROLES = ["administrator", "clinician", "client"];

function validateFieldShape(field, label) {
  requireObject(field, label);
  enforceAllowedKeys(
    field,
    ["key", "label", "fieldType", "options", "required", "visibleTo"],
    label
  );
  requireNonEmptyString(field.key, `${label}.key`, 40);
  if (!FIELD_KEY_PATTERN.test(field.key.trim().toLowerCase())) {
    throw new AppError(
      `${label}.key must be 2-40 chars of [a-z0-9_]`,
      400,
      "INVALID_REQUEST"
    );
  }
  requireNonEmptyString(field.label, `${label}.label`, 120);
  requireEnum(field.fieldType, `${label}.fieldType`, FIELD_TYPES);
  if (field.options !== undefined) {
    if (!Array.isArray(field.options)) {
      throw new AppError(`${label}.options must be an array`, 400, "INVALID_REQUEST");
    }
    if (field.fieldType !== "select" && field.options.length > 0) {
      throw new AppError(
        `${label}.options is only valid for fieldType=select`,
        400,
        "INVALID_REQUEST"
      );
    }
    if (field.options.length > 50) {
      throw new AppError(`${label}.options too long`, 400, "INVALID_REQUEST");
    }
    for (const option of field.options) {
      if (typeof option !== "string" || !option.trim() || option.length > 80) {
        throw new AppError(
          `${label}.options entries must be non-empty strings ≤ 80 chars`,
          400,
          "INVALID_REQUEST"
        );
      }
    }
  }
  if (field.required !== undefined && typeof field.required !== "boolean") {
    throw new AppError(`${label}.required must be a boolean`, 400, "INVALID_REQUEST");
  }
  if (field.visibleTo !== undefined) {
    if (!Array.isArray(field.visibleTo) || !field.visibleTo.length) {
      throw new AppError(
        `${label}.visibleTo must be a non-empty array`,
        400,
        "INVALID_REQUEST"
      );
    }
    for (const role of field.visibleTo) {
      if (!VISIBLE_ROLES.includes(role)) {
        throw new AppError(
          `${label}.visibleTo contains invalid role: ${role}`,
          400,
          "INVALID_REQUEST"
        );
      }
    }
  }
}

export function validateProfileFieldUpdate(req) {
  requireObject(req.body, "body");
  enforceAllowedKeys(req.body, ["profileFields", "reason"], "body");
  requireObject(req.body.profileFields, "profileFields");
  requireNonEmptyString(req.body.reason, "reason", 255);
}

export function validateAddCustomProfileField(req) {
  requireObject(req.body, "body");
  enforceAllowedKeys(req.body, ["field", "reason"], "body");
  validateFieldShape(req.body.field, "field");
  requireNonEmptyString(req.body.reason, "reason", 255);
}

export function validateUpdateCustomProfileField(req) {
  requireObject(req.body, "body");
  enforceAllowedKeys(req.body, ["updates", "reason"], "body");
  requireObject(req.body.updates, "updates");
  enforceAllowedKeys(
    req.body.updates,
    ["label", "options", "required", "visibleTo"],
    "updates"
  );
  if (req.body.updates.label !== undefined) {
    requireNonEmptyString(req.body.updates.label, "updates.label", 120);
  }
  if (req.body.updates.options !== undefined) {
    if (!Array.isArray(req.body.updates.options)) {
      throw new AppError("updates.options must be an array", 400, "INVALID_REQUEST");
    }
    if (req.body.updates.options.length > 50) {
      throw new AppError("updates.options too long", 400, "INVALID_REQUEST");
    }
    for (const option of req.body.updates.options) {
      if (typeof option !== "string" || !option.trim() || option.length > 80) {
        throw new AppError(
          "updates.options entries must be non-empty strings ≤ 80 chars",
          400,
          "INVALID_REQUEST"
        );
      }
    }
  }
  if (req.body.updates.required !== undefined && typeof req.body.updates.required !== "boolean") {
    throw new AppError("updates.required must be a boolean", 400, "INVALID_REQUEST");
  }
  if (req.body.updates.visibleTo !== undefined) {
    if (!Array.isArray(req.body.updates.visibleTo) || !req.body.updates.visibleTo.length) {
      throw new AppError(
        "updates.visibleTo must be a non-empty array",
        400,
        "INVALID_REQUEST"
      );
    }
    for (const role of req.body.updates.visibleTo) {
      if (!VISIBLE_ROLES.includes(role)) {
        throw new AppError(
          `updates.visibleTo contains invalid role: ${role}`,
          400,
          "INVALID_REQUEST"
        );
      }
    }
  }
  requireNonEmptyString(req.body.reason, "reason", 255);
  if (!req.params || !FIELD_KEY_PATTERN.test(String(req.params.key || ""))) {
    throw new AppError("path parameter 'key' is invalid", 400, "INVALID_REQUEST");
  }
}

export function validateDeleteCustomProfileField(req) {
  requireObject(req.body, "body");
  enforceAllowedKeys(req.body, ["reason"], "body");
  requireNonEmptyString(req.body.reason, "reason", 255);
  if (!req.params || !FIELD_KEY_PATTERN.test(String(req.params.key || ""))) {
    throw new AppError("path parameter 'key' is invalid", 400, "INVALID_REQUEST");
  }
}

// /system/backup-restore is a critical destructive operation. The validator
// enforces a strict allowlist (filename + reason ONLY), shape constraints
// on `filename` (matches the same allowlist regex used by
// SystemService.resolveBackupPath so the request is rejected at the edge
// before reaching service code), and a non-empty `reason`. The
// `x-idempotency-key` header is checked separately by the service layer
// since it lives outside the body.
const BACKUP_FILENAME_ROUTE_PATTERN = /^mindtrack-backup-[A-Za-z0-9-]+\.enc\.json$/;

export function validateBackupRestoreRequest(req) {
  requireObject(req.body, "body");
  enforceAllowedKeys(req.body, ["filename", "reason"], "body");
  requireNonEmptyString(req.body.filename, "filename", 200);
  if (!BACKUP_FILENAME_ROUTE_PATTERN.test(req.body.filename)) {
    throw new AppError(
      "filename must match ^mindtrack-backup-[A-Za-z0-9-]+\\.enc\\.json$",
      400,
      "INVALID_BACKUP_FILENAME"
    );
  }
  requireNonEmptyString(req.body.reason, "reason", 255);
  // The idempotency key is required by the service layer; surface it as a
  // 400 here too so the malformed-request boundary is consistent.
  const idemKey = req.get ? req.get("x-idempotency-key") : null;
  if (!idemKey || typeof idemKey !== "string" || idemKey.length === 0) {
    throw new AppError(
      "x-idempotency-key header is required",
      400,
      "IDEMPOTENCY_REQUIRED"
    );
  }
  if (idemKey.length > 200) {
    throw new AppError(
      "x-idempotency-key header is too long",
      400,
      "INVALID_REQUEST"
    );
  }
}

export function validateBackupRun(req) {
  if (req.body && typeof req.body === "object" && !Array.isArray(req.body)) {
    enforceAllowedKeys(req.body, ["reason"], "body");
    if (req.body.reason !== undefined && req.body.reason !== null && req.body.reason !== "") {
      requireNonEmptyString(req.body.reason, "reason", 255);
    }
  }
}
