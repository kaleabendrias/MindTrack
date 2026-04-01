export function errorHandler(err, _req, res, _next) {
  if (err?.statusCode) {
    return res.status(err.statusCode).json({
      error: err.message,
      code: err.code || "APPLICATION_ERROR",
      details: err.details || undefined
    });
  }

  return res.status(500).json({
    error: "internal server error",
    code: "INTERNAL_ERROR"
  });
}
