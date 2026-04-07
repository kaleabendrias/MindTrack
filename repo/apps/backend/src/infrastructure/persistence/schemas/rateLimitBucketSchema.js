import mongoose from "mongoose";

// Persistent rate-limit bucket. Replaces the previous in-memory Maps so that
// abuse-control budgets survive process restarts and so that — in a future
// horizontally-scaled deployment — multiple backend instances share a single
// budget per session/IP rather than each running their own private counter.
//
// _id is the bucket key, e.g. "session:<sessionId>" or "ip-recovery:<ip>",
// so that all increments target the same document atomically.
export const rateLimitBucketSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    scope: { type: String, required: true, index: true },
    windowStart: { type: Date, required: true },
    count: { type: Number, required: true, default: 0 },
    lockedUntil: { type: Date, default: null },
    updatedAt: { type: Date, required: true }
  },
  {
    versionKey: false
  }
);
