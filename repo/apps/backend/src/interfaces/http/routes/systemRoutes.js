import { Router } from "express";
import { permissions } from "../../../domain/models/User.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { requirePermission } from "../middleware/authMiddleware.js";
import { validateRequest } from "../middleware/validationMiddleware.js";
import { validateBackupRun, validateProfileFieldUpdate } from "../validation/systemValidators.js";

export function createSystemRoutes(controller) {
  const router = Router();

  router.get("/offline-policy", asyncHandler(controller.offlinePolicy));
  router.get("/profile-fields", asyncHandler(controller.profileFields));
  router.get("/my-security-flags", asyncHandler(controller.mySecurityFlags));
  router.get("/security-flags", requirePermission(permissions.auditRead), asyncHandler(controller.securityFlags));
  router.get("/backup-status", requirePermission(permissions.auditRead), asyncHandler(controller.backupStatus));
  router.patch(
    "/profile-fields",
    requirePermission(permissions.userManage),
    validateRequest(validateProfileFieldUpdate),
    asyncHandler(controller.updateProfileFields)
  );
  router.post(
    "/profile-fields/custom",
    requirePermission(permissions.userManage),
    asyncHandler(controller.addCustomProfileField)
  );
  router.patch(
    "/profile-fields/custom/:key",
    requirePermission(permissions.userManage),
    asyncHandler(controller.updateCustomProfileField)
  );
  router.delete(
    "/profile-fields/custom/:key",
    requirePermission(permissions.userManage),
    asyncHandler(controller.deleteCustomProfileField)
  );
  router.post(
    "/backup-run",
    requirePermission(permissions.auditRead),
    validateRequest(validateBackupRun),
    asyncHandler(controller.runBackupNow)
  );
  router.get(
    "/audit-immutability-check",
    requirePermission(permissions.auditRead),
    asyncHandler(controller.auditImmutabilityCheck)
  );

  return router;
}
