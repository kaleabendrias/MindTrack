import { AppError } from "../../../domain/errors/AppError.js";

export function validateRequest(validator) {
  return (req, _res, next) => {
    try {
      validator(req);
      next();
    } catch (error) {
      if (error instanceof AppError) {
        next(error);
        return;
      }
      next(new AppError(error.message || "invalid request", 400, "INVALID_REQUEST"));
    }
  };
}
