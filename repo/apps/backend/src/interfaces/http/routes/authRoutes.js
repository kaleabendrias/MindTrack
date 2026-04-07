import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { questionLookupRateLimiter, recoveryRateLimiter } from "../middleware/rateLimitMiddleware.js";
import { validateRequest } from "../middleware/validationMiddleware.js";
import {
  validateLoginRequest,
  validateRecoveryRequest,
  validateRefreshRequest,
  validateRotatePasswordRequest
} from "../validation/authValidators.js";

/**
 * Unauthenticated auth routes — these MUST live outside the protected
 * /api/v1 chain because they bootstrap the session itself (no signing
 * key, no csrf token, no session id available yet).
 */
export function createUnauthAuthRoutes(authController) {
  const router = Router();

  router.post("/login", validateRequest(validateLoginRequest), asyncHandler(authController.login));
  router.post(
    "/refresh",
    validateRequest(validateRefreshRequest),
    asyncHandler(authController.refresh)
  );
  // Rate limited to prevent username enumeration via repeated probing.
  // Uses a separate, more generous bucket from /recover-password since
  // legitimate users may legitimately probe several times to remember
  // which account they own. The handler also returns a generic payload
  // regardless of username validity (see AuthService.getSecurityQuestions).
  router.get(
    "/security-questions",
    questionLookupRateLimiter,
    asyncHandler(authController.securityQuestions)
  );
  router.post(
    "/recover-password",
    recoveryRateLimiter,
    validateRequest(validateRecoveryRequest),
    asyncHandler(authController.recoverPassword)
  );
  router.post("/third-party", asyncHandler(authController.thirdPartyLogin));

  return router;
}

/**
 * Protected auth routes — these are mounted UNDER the /api/v1 protected
 * middleware stack (authenticate → enforcePasswordRotation → request
 * signing → session rate limit → security monitoring), so they receive
 * exactly the same defense-in-depth as every other authenticated route
 * and there is no second-class auth surface.
 *
 * Note: `authenticate` is intentionally NOT applied here per-route because
 * the global /api/v1 chain already runs it; double-applying would do the
 * work twice and silently mask any future ordering changes.
 */
export function createProtectedAuthRoutes(authController) {
  const router = Router();

  router.get("/session", asyncHandler(authController.session));
  router.post(
    "/rotate-password",
    validateRequest(validateRotatePasswordRequest),
    asyncHandler(authController.rotatePassword)
  );
  router.post("/logout", asyncHandler(authController.logout));

  return router;
}
