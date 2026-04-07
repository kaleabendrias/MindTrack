import { RateLimitBucketModel } from "../persistence/models/RateLimitBucketModel.js";

/**
 * Atomically increment a persistent rate-limit bucket and return the post-
 * increment state. The bucket is reset whenever its current window has
 * elapsed. Lock state (lockedUntil) is preserved across process restarts.
 *
 * The implementation uses two phases per call:
 *   1. A conditional reset (only if the bucket window has elapsed AND the
 *      lock is no longer active).
 *   2. An unconditional `$inc` of the count, which upserts on first use.
 *
 * Both phases run as single Mongo operations and require no application-side
 * locking. Two competing increments cannot both reset the window because the
 * conditional reset only matches one of them per logical window boundary.
 */
export class MongoRateLimitRepository {
  /**
   * @param {string} key  bucket identifier (e.g. `session:abc` or
   *                      `ip-recovery:127.0.0.1`)
   * @param {string} scope  free-form bucket family for diagnostics
   * @param {number} windowMs  rolling window length in ms
   */
  async incrementAndCheck(key, scope, windowMs) {
    const now = new Date();
    const cutoff = new Date(now.getTime() - windowMs);

    // Conditional reset: if the bucket has expired AND no active lock,
    // restart the window. Use $expr-style fields with two ops to avoid
    // race conditions on concurrent calls.
    await RateLimitBucketModel.updateOne(
      {
        _id: key,
        windowStart: { $lt: cutoff },
        $or: [{ lockedUntil: null }, { lockedUntil: { $lt: now } }]
      },
      {
        $set: {
          windowStart: now,
          count: 0,
          lockedUntil: null,
          updatedAt: now,
          scope
        }
      }
    );

    // Atomic increment + upsert. setOnInsert seeds the window for brand new
    // buckets without clobbering an existing window.
    const updated = await RateLimitBucketModel.findByIdAndUpdate(
      key,
      {
        $inc: { count: 1 },
        $set: { updatedAt: now, scope },
        $setOnInsert: { windowStart: now, lockedUntil: null }
      },
      { upsert: true, new: true }
    ).lean();

    return {
      count: updated.count,
      windowStart: updated.windowStart,
      lockedUntil: updated.lockedUntil,
      now
    };
  }

  async setLockedUntil(key, scope, lockedUntil) {
    const now = new Date();
    await RateLimitBucketModel.updateOne(
      { _id: key },
      {
        $set: { lockedUntil, updatedAt: now, scope }
      },
      { upsert: true }
    );
  }

  async getLockState(key) {
    const doc = await RateLimitBucketModel.findById(key).lean();
    if (!doc) {
      return { lockedUntil: null };
    }
    return { lockedUntil: doc.lockedUntil || null };
  }
}
