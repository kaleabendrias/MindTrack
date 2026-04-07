import crypto from "node:crypto";
import { AppError } from "../../domain/errors/AppError.js";

// How long to wait between polls when a concurrent request holds the
// pending reservation. Kept short — most handlers complete in well under
// a second.
const PENDING_POLL_INTERVAL_MS = 50;
// Hard cap on how long we wait for a competing request to finish before
// giving up and returning 409 IDEMPOTENCY_IN_FLIGHT. Bigger than the
// 5-minute signature skew window so a slow handler that fits inside the
// signing window has time to finish.
const PENDING_POLL_TIMEOUT_MS = 30_000;

export class IdempotencyService {
  constructor(idempotencyRepository) {
    this.idempotencyRepository = idempotencyRepository;
  }

  async execute({ key, userId, action, handler }) {
    if (!key || typeof key !== "string") {
      throw new AppError("x-idempotency-key is required", 400, "IDEMPOTENCY_REQUIRED");
    }

    // Phase 1 — atomic reserve. We INSERT a pending record before running
    // the handler. The unique (key, userId, action) index is what
    // serializes concurrent requests: only one insert can win.
    const recordId = crypto.randomUUID().replaceAll("-", "");
    const now = new Date();
    const { created, record } = await this.idempotencyRepository.reserve({
      key,
      userId,
      action,
      recordId,
      now
    });

    if (!created) {
      // A reservation already exists. Two cases:
      //   (a) The previous request finished and cached its response → we
      //       return that cached response as an idempotent replay.
      //   (b) The previous request is still running ("pending") → we
      //       wait, polling, until it finishes or we exceed the timeout.
      if (record.status === "completed") {
        return {
          idempotentReplay: true,
          statusCode: record.statusCode,
          body: record.responseBody
        };
      }
      if (record.status === "pending") {
        return this._waitForCompletion({ key, userId, action });
      }
      // Anything else (e.g. legacy "failed" rows) is treated as gone —
      // re-throw a clean error so the caller can retry.
      throw new AppError(
        "idempotency record in unknown state, please retry",
        409,
        "IDEMPOTENCY_CONFLICT"
      );
    }

    // Phase 2 — we own the reservation; run the real handler.
    let result;
    try {
      result = await handler();
    } catch (err) {
      // Pending record must NOT linger on failure, otherwise legitimate
      // retries would be blocked or replayed against a stale "completed"
      // entry. Delete the pending row and propagate the original error.
      await this.idempotencyRepository.markFailed({ key, userId, action, now: new Date() });
      throw err;
    }

    // Phase 3 — promote the reservation to a cached completed response.
    await this.idempotencyRepository.markCompleted({
      key,
      userId,
      action,
      statusCode: result.statusCode,
      responseBody: result.body,
      now: new Date()
    });

    return {
      idempotentReplay: false,
      statusCode: result.statusCode,
      body: result.body
    };
  }

  async _waitForCompletion({ key, userId, action }) {
    const start = Date.now();
    while (Date.now() - start < PENDING_POLL_TIMEOUT_MS) {
      await new Promise((resolve) => setTimeout(resolve, PENDING_POLL_INTERVAL_MS));
      const latest = await this.idempotencyRepository.findByKey({ key, userId, action });
      if (!latest) {
        // The pending owner failed and rolled back its reservation. The
        // caller should retry the request from scratch.
        throw new AppError(
          "concurrent idempotent request failed, please retry",
          409,
          "IDEMPOTENCY_RETRY"
        );
      }
      if (latest.status === "completed") {
        return {
          idempotentReplay: true,
          statusCode: latest.statusCode,
          body: latest.responseBody
        };
      }
    }
    throw new AppError(
      "concurrent idempotent request still in progress",
      409,
      "IDEMPOTENCY_IN_FLIGHT"
    );
  }
}
