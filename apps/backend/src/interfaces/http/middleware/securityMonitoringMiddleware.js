export function createSecurityMonitoringMiddleware(securityMonitoringService) {
  return async (req, _res, next) => {
    try {
      if (req.session) {
        const flagged = await securityMonitoringService.evaluateSessionUsage({
          session: req.session,
          ipAddress: req.ip,
          userAgent: req.get("user-agent") || "",
          method: req.method,
          path: req.originalUrl.split("?")[0]
        });
        req.securityFlagged = flagged;
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}
