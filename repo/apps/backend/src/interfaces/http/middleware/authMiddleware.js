import { AppError } from "../../../domain/errors/AppError.js";
import { verifyAccessToken } from "../../../infrastructure/security/tokenService.js";
import { parseCookies } from "../httpCookies.js";

export function createAuthenticateMiddleware({ sessionRepository, userRepository }) {
  return async (req, _res, next) => {
    try {
      const authorization = req.get("authorization") || "";
      const [scheme, token] = authorization.split(" ");
      const cookies = parseCookies(req);
      const cookieToken = cookies.mindtrack_access_token;
      const resolvedToken = scheme === "Bearer" && token ? token : cookieToken;
      if (!resolvedToken) {
        throw new AppError("missing authenticated session", 401, "UNAUTHORIZED");
      }

      const payload = verifyAccessToken(resolvedToken);
      const session = await sessionRepository.findById(payload.sid);
      if (!session || session.revokedAt || session.expiresAt < new Date()) {
        throw new AppError("session expired", 401, "SESSION_EXPIRED");
      }

      const user = await userRepository.findById(payload.sub);
      if (!user) {
        throw new AppError("user not found", 404, "USER_NOT_FOUND");
      }

      req.user = {
        id: user.id,
        username: user.username,
        role: user.role,
        mindTrackClientId: user.mindTrackClientId || null,
        permissions: user.permissions,
        mustRotatePassword: Boolean(user.mustRotatePassword),
        sessionId: session.id
      };
      req.session = session;
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requirePermission(permission) {
  return (req, _res, next) => {
    if (!req.user || !req.user.permissions.includes(permission)) {
      next(new AppError("insufficient permissions", 403, "FORBIDDEN"));
      return;
    }
    next();
  };
}

// Routes that remain accessible while a user still has mustRotatePassword=true.
// Everything else under /api/v1 is blocked until the user rotates.
const PASSWORD_ROTATION_EXEMPT_PATHS = new Set([
  "/api/v1/auth/session",
  "/api/v1/auth/logout",
  "/api/v1/auth/rotate-password",
  "/api/v1/users/me/rotate-password"
]);

export function enforcePasswordRotation(req, _res, next) {
  if (!req.user || !req.user.mustRotatePassword) {
    next();
    return;
  }
  const basePath = req.path || req.originalUrl?.split("?")[0] || "/";
  if (PASSWORD_ROTATION_EXEMPT_PATHS.has(basePath)) {
    next();
    return;
  }
  next(
    new AppError(
      "password rotation required before continuing",
      403,
      "PASSWORD_ROTATION_REQUIRED"
    )
  );
}
