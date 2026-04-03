export function errorHandler(err, req, res, _next) {
  if (err?.statusCode) {
    if (err.statusCode >= 500) {
      console.error(JSON.stringify({
        level: "error",
        type: "unhandled_application_error",
        method: req.method,
        path: req.originalUrl || req.path,
        userId: req.user?.id || null,
        statusCode: err.statusCode,
        code: err.code,
        message: err.message,
        stack: err.stack,
        timestamp: new Date().toISOString()
      }));
    }
    return res.status(err.statusCode).json({
      error: err.message,
      code: err.code || "APPLICATION_ERROR",
      details: err.details || undefined
    });
  }

  console.error(JSON.stringify({
    level: "error",
    type: "unexpected_500",
    method: req.method,
    path: req.originalUrl || req.path,
    userId: req.user?.id || null,
    message: err?.message || "unknown error",
    stack: err?.stack || null,
    timestamp: new Date().toISOString()
  }));

  return res.status(500).json({
    error: "internal server error",
    code: "INTERNAL_ERROR"
  });
}
