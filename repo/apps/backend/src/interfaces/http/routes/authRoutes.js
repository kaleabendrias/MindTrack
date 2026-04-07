import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { recoveryRateLimiter } from "../middleware/rateLimitMiddleware.js";
import { validateRequest } from "../middleware/validationMiddleware.js";
import {
  validateLoginRequest,
  validateRecoveryRequest,
  validateRefreshRequest
} from "../validation/authValidators.js";

export function createAuthRoutes(authController, authenticate) {
  const router = Router();

  router.post("/login", validateRequest(validateLoginRequest), asyncHandler(authController.login));
  router.post(
    "/refresh",
    validateRequest(validateRefreshRequest),
    asyncHandler(authController.refresh)
  );
  // Rate limited to prevent username enumeration via repeated probing.
  // The handler also returns a generic payload regardless of username
  // validity (see AuthService.getSecurityQuestions).
  router.get(
    "/security-questions",
    recoveryRateLimiter,
    asyncHandler(authController.securityQuestions)
  );
  router.post(
    "/recover-password",
    recoveryRateLimiter,
    validateRequest(validateRecoveryRequest),
    asyncHandler(authController.recoverPassword)
  );
  router.get("/session", authenticate, asyncHandler(authController.session));
  router.post("/third-party", asyncHandler(authController.thirdPartyLogin));

  return router;
}
