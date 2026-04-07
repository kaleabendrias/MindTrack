import { AppError } from "../../../domain/errors/AppError.js";
import { verifyRequestSignature } from "../../../infrastructure/security/requestSigner.js";

// Sliding window in which a nonce, once seen, cannot be reused. The window
// is wide enough to cover the signature-timestamp skew window plus typical
// network jitter. Anything older than this is pruned automatically by the
// session repository's `recordNonce` operation.
export const NONCE_TTL_MS = 5 * 60 * 1000;

export function createRequestSigningMiddleware({ sessionRepository, nonceTtlMs = NONCE_TTL_MS }) {
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

      // Replay protection: every accepted nonce is persisted in a per-session
      // ledger. The repository operation is atomic — it prunes expired nonces
      // and only inserts the new nonce if no UNEXPIRED entry already matches.
      // This rejects ANY previously seen nonce within its TTL, not just the
      // most recent one (defends against non-consecutive replay attacks).
      const isMutating = !["GET", "HEAD", "OPTIONS"].includes(req.method.toUpperCase());
      if (isMutating) {
        const csrfToken = req.get("x-csrf-token");
        if (!csrfToken) {
          throw new AppError("missing trusted request headers", 401, "SIGNATURE_REQUIRED");
        }
        if (req.session.csrfToken !== csrfToken) {
          throw new AppError("invalid trusted request token", 401, "INVALID_SIGNATURE");
        }
      }

      const accepted = await sessionRepository.recordNonce(
        req.session.id,
        nonce,
        nonceTtlMs
      );
      if (!accepted) {
        throw new AppError("replayed request detected", 401, "REPLAY_DETECTED");
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
