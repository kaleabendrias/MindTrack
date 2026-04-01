import { AppError } from "../../../domain/errors/AppError.js";

export function requireObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AppError(`${label} must be an object`, 400, "INVALID_REQUEST");
  }
}

export function enforceAllowedKeys(value, allowedKeys, label) {
  const keys = Object.keys(value);
  const unknown = keys.filter((key) => !allowedKeys.includes(key));
  if (unknown.length) {
    throw new AppError(
      `${label} contains unsupported fields: ${unknown.join(", ")}`,
      400,
      "UNSUPPORTED_FIELDS"
    );
  }
}

export function requireNonEmptyString(value, label, maxLength = 255) {
  if (typeof value !== "string" || !value.trim()) {
    throw new AppError(`${label} is required`, 400, "INVALID_REQUEST");
  }
  if (value.trim().length > maxLength) {
    throw new AppError(`${label} exceeds max length`, 400, "INVALID_REQUEST");
  }
}

export function requireEnum(value, label, options) {
  if (!options.includes(value)) {
    throw new AppError(
      `${label} must be one of: ${options.join(", ")}`,
      400,
      "INVALID_REQUEST"
    );
  }
}

export function requireOptionalEnum(value, label, options) {
  if (value === undefined || value === null || value === "") {
    return;
  }
  requireEnum(value, label, options);
}

export function requireId(value, label) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{3,64}$/.test(value)) {
    throw new AppError(`${label} is invalid`, 400, "INVALID_REQUEST");
  }
}

export function requireOptionalDate(value, label) {
  if (value === undefined || value === null || value === "") {
    return;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new AppError(`${label} must be a valid date`, 400, "INVALID_REQUEST");
  }
}

export function requireNumberInRange(value, label, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new AppError(`${label} must be between ${min} and ${max}`, 400, "INVALID_REQUEST");
  }
}
