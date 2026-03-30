import { AppError } from "../../../domain/errors/AppError.js";
import { verifyRequestSignature } from "../../../infrastructure/security/requestSigner.js";

export function createRequestSigningMiddleware({ sessionRepository }) {
  return async (req, _res, next) => {
    try {
      const timestamp = req.get("x-signature-timestamp");
      const signature = req.get("x-signature");
      const nonce = req.get("x-signature-nonce") || req.get("x-request-nonce");

      if (!timestamp || !signature || !nonce) {
        throw new AppError("missing request signature headers", 401, "SIGNATURE_REQUIRED");
      }

      const bodyString = ["GET", "HEAD", "OPTIONS"].includes(req.method.toUpperCase())
        ? ""
        : req.body && typeof req.body === "object"
          ? JSON.stringify(req.body)
          : req.body
            ? String(req.body)
            : "";
      verifyRequestSignature({
        method: req.method,
        path: req.originalUrl,
        timestamp,
        nonce,
        body: bodyString,
        signature,
        secret: req.session.requestSigningKey
      });

      if (["GET", "HEAD", "OPTIONS"].includes(req.method.toUpperCase())) {
        await sessionRepository.update(req.session.id, { lastNonce: nonce });
        next();
        return;
      }

      const csrfToken = req.get("x-csrf-token");

      if (!csrfToken) {
        throw new AppError("missing trusted request headers", 401, "SIGNATURE_REQUIRED");
      }

      if (req.session.lastNonce && req.session.lastNonce === nonce) {
        throw new AppError("replayed request detected", 401, "REPLAY_DETECTED");
      }

      if (req.session.csrfToken !== csrfToken) {
        throw new AppError("invalid trusted request token", 401, "INVALID_SIGNATURE");
      }

      await sessionRepository.update(req.session.id, { lastNonce: nonce });
      next();
    } catch (error) {
      next(error);
    }
  };
}
