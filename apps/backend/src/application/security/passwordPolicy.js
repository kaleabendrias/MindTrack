import { AppError } from "../../domain/errors/AppError.js";

export function enforcePasswordPolicy(password) {
  if (typeof password !== "string") {
    throw new AppError("password is required", 400, "PASSWORD_REQUIRED");
  }

  const hasMinLength = password.length >= 12;
  const hasLetter = /[A-Za-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);

  if (!hasMinLength || !hasLetter || !hasNumber) {
    throw new AppError(
      "password must be at least 12 characters and contain at least one letter and one number",
      400,
      "PASSWORD_POLICY_VIOLATION"
    );
  }
}
