import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { AuthService } from "../../application/services/AuthService.js";
import { AuditService } from "../../application/services/AuditService.js";
import { IdempotencyService } from "../../application/services/IdempotencyService.js";
import { MindTrackService } from "../../application/services/MindTrackService.js";
import { SecurityMonitoringService } from "../../application/services/SecurityMonitoringService.js";
import { SystemService } from "../../application/services/SystemService.js";
import { ThirdPartyLoginService } from "../../application/services/ThirdPartyLoginService.js";
import { WorkOrderService } from "../../application/services/WorkOrderService.js";
import { MongoAuditLogRepository } from "../../infrastructure/repositories/MongoAuditLogRepository.js";
import { MongoIdempotencyRepository } from "../../infrastructure/repositories/MongoIdempotencyRepository.js";
import { MongoMindTrackRepository } from "../../infrastructure/repositories/MongoMindTrackRepository.js";
import { MongoSecurityFlagRepository } from "../../infrastructure/repositories/MongoSecurityFlagRepository.js";
import { MongoSessionRepository } from "../../infrastructure/repositories/MongoSessionRepository.js";
import { MongoSystemRepository } from "../../infrastructure/repositories/MongoSystemRepository.js";
import { MongoUserRepository } from "../../infrastructure/repositories/MongoUserRepository.js";
import { MongoWorkOrderRepository } from "../../infrastructure/repositories/MongoWorkOrderRepository.js";
import { AuthController } from "./controllers/AuthController.js";
import { MindTrackController } from "./controllers/MindTrackController.js";
import { SystemController } from "./controllers/SystemController.js";
import { UserController } from "./controllers/UserController.js";
import { WorkOrderController } from "./controllers/WorkOrderController.js";
import { createAuthenticateMiddleware } from "./middleware/authMiddleware.js";
import { asyncHandler } from "./middleware/asyncHandler.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { sessionRateLimiter } from "./middleware/rateLimitMiddleware.js";
import { createRequestSigningMiddleware } from "./middleware/requestSigningMiddleware.js";
import { createSecurityMonitoringMiddleware } from "./middleware/securityMonitoringMiddleware.js";
import { createAuthRoutes } from "./routes/authRoutes.js";
import { createHealthRoutes } from "./routes/healthRoutes.js";
import { createMindTrackRoutes } from "./routes/mindTrackRoutes.js";
import { createSystemRoutes } from "./routes/systemRoutes.js";
import { createUserRoutes } from "./routes/userRoutes.js";
import { createWorkOrderRoutes } from "./routes/workOrderRoutes.js";

export function createApp() {
  const app = express();

  const userRepository = new MongoUserRepository();
  const sessionRepository = new MongoSessionRepository();
  const workOrderRepository = new MongoWorkOrderRepository();
  const auditRepository = new MongoAuditLogRepository();
  const securityFlagRepository = new MongoSecurityFlagRepository();
  const mindTrackRepository = new MongoMindTrackRepository();
  const idempotencyRepository = new MongoIdempotencyRepository();
  const systemRepository = new MongoSystemRepository();

  const auditService = new AuditService(auditRepository);
  const idempotencyService = new IdempotencyService(idempotencyRepository);
  const authService = new AuthService({
    userRepository,
    sessionRepository,
    auditService
  });
  const workOrderService = new WorkOrderService(workOrderRepository, auditService);
  const mindTrackService = new MindTrackService({
    mindTrackRepository,
    auditService,
    idempotencyService,
    userRepository
  });
  const securityMonitoringService = new SecurityMonitoringService(
    securityFlagRepository,
    sessionRepository
  );
  const thirdPartyLoginService = new ThirdPartyLoginService();
  const systemService = new SystemService(systemRepository, auditService, securityMonitoringService);
  systemService.start();

  const authController = new AuthController(authService, thirdPartyLoginService);
  const workOrderController = new WorkOrderController(workOrderService);
  const mindTrackController = new MindTrackController(mindTrackService);
  const systemController = new SystemController(systemService);
  const userController = new UserController(authService, userRepository);

  const authenticate = createAuthenticateMiddleware({ sessionRepository, userRepository });
  const signedRequestRequired = createRequestSigningMiddleware({ sessionRepository });
  const securityMonitoring = createSecurityMonitoringMiddleware(securityMonitoringService);

  morgan.token("safe-path", (req) => {
    const basePath = req.path || req.originalUrl?.split("?")[0] || "/";
    if (basePath.startsWith("/api/v1/auth")) {
      return `${basePath} [redacted]`;
    }
    return basePath;
  });

  const safeLogger = morgan((tokens, req, res) => {
    return [
      tokens.method(req, res),
      tokens["safe-path"](req, res),
      tokens.status(req, res),
      tokens.res(req, res, "content-length") || "-",
      "bytes",
      tokens["response-time"](req, res),
      "ms"
    ].join(" ");
  });

  app.use(helmet());
  app.use(cors());
  app.use(safeLogger);
  app.use(express.json({ limit: "1mb" }));

  app.use(createHealthRoutes());
  app.use("/api/v1/auth", createAuthRoutes(authController, authenticate));

  app.use("/api/v1", authenticate, signedRequestRequired, sessionRateLimiter, securityMonitoring);
  app.use("/api/v1/work-orders", createWorkOrderRoutes(workOrderController));
  app.use("/api/v1/mindtrack", createMindTrackRoutes(mindTrackController));
  app.use("/api/v1/system", createSystemRoutes(systemController));
  app.use("/api/v1/users", createUserRoutes(userController));
  app.post("/api/v1/auth/logout", asyncHandler(authController.logout));

  app.use(errorHandler);

  return app;
}
