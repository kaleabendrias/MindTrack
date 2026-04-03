import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { validateRequest } from "../middleware/validationMiddleware.js";
import {
  validateAmendEntry,
  validateCreateClient,
  validateCreateEntry,
  validateCriticalWrite,
  validateGovernanceUpdate,
  validateMergeClients,
  validateNearbyRequest,
  validateSearchRequest,
  validateTimelineRequest,
  validateUpdateClient
} from "../validation/mindTrackValidators.js";

export function createMindTrackRoutes(controller) {
  const router = Router();

  router.get("/clients", asyncHandler(controller.listClients));
  router.get("/self-context", asyncHandler(controller.selfContext));
  router.post("/clients", validateRequest(validateCreateClient), asyncHandler(controller.createClient));
  router.post("/clients/merge", validateRequest(validateMergeClients), asyncHandler(controller.mergeClients));
  router.patch(
    "/clients/:clientId",
    validateRequest(validateUpdateClient),
    asyncHandler(controller.updateClient)
  );
  router.patch(
    "/clients/:clientId/governance",
    validateRequest(validateGovernanceUpdate),
    asyncHandler(controller.updateGovernance)
  );

  router.get(
    "/clients/:clientId/timeline",
    validateRequest(validateTimelineRequest),
    asyncHandler(controller.timeline)
  );

  router.post("/entries", validateRequest(validateCreateEntry), asyncHandler(controller.createEntry));
  router.get("/entries/:entryId/attachments/:fingerprint", asyncHandler(controller.getAttachment));
  router.post("/entries/:entryId/sign", validateRequest(validateCriticalWrite), asyncHandler(controller.signEntry));
  router.post("/entries/:entryId/amend", validateRequest(validateAmendEntry), asyncHandler(controller.amendEntry));
  router.post(
    "/entries/:entryId/restore",
    validateRequest(validateCriticalWrite),
    asyncHandler(controller.restoreEntry)
  );

  router.get("/search", validateRequest(validateSearchRequest), asyncHandler(controller.search));
  router.get("/search/trending", asyncHandler(controller.trendingTerms));

  router.get(
    "/recommendations/nearby",
    validateRequest(validateNearbyRequest),
    asyncHandler(controller.nearbyFacilities)
  );

  return router;
}
