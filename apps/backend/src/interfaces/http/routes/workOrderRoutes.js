import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { validateRequest } from "../middleware/validationMiddleware.js";
import {
  validateWorkOrderCreate,
  validateWorkOrderDelete,
  validateWorkOrderUpdateStatus
} from "../validation/workOrderValidators.js";

export function createWorkOrderRoutes(workOrderController) {
  const router = Router();

  router.get("/", asyncHandler(workOrderController.list));
  router.post(
    "/",
    validateRequest(validateWorkOrderCreate),
    asyncHandler(workOrderController.create)
  );
  router.patch(
    "/:id/status",
    validateRequest(validateWorkOrderUpdateStatus),
    asyncHandler(workOrderController.updateStatus)
  );
  router.delete(
    "/:id",
    validateRequest(validateWorkOrderDelete),
    asyncHandler(workOrderController.delete)
  );

  return router;
}
