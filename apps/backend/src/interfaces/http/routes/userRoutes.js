import { Router } from "express";
import { permissions } from "../../../domain/models/User.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { requirePermission } from "../middleware/authMiddleware.js";
import { validateRequest } from "../middleware/validationMiddleware.js";
import { validateAdminReset, validateUserCreate } from "../validation/userValidators.js";

export function createUserRoutes(userController) {
  const router = Router();

  router.get("/", requirePermission(permissions.userManage), asyncHandler(userController.list));
  router.post(
    "/",
    requirePermission(permissions.userManage),
    validateRequest(validateUserCreate),
    asyncHandler(userController.create)
  );
  router.post(
    "/:id/reset-password",
    requirePermission(permissions.userManage),
    validateRequest(validateAdminReset),
    asyncHandler(userController.adminResetPassword)
  );

  return router;
}
