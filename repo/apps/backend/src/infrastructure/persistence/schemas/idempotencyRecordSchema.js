import mongoose from "mongoose";

// Idempotency records use a reservation-then-fulfill pattern. A pending
// record is inserted BEFORE the handler runs; the unique index on
// (key, userId, action) is what prevents two concurrent requests from
// double-running the handler. The pending record is then upgraded to
// "completed" with the response body, or to "failed" if the handler
// throws so that retries can re-attempt.
export const idempotencyRecordSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    key: { type: String, required: true },
    userId: { type: String, required: true },
    action: { type: String, required: true },
    status: {
      type: String,
      enum: ["pending", "completed", "failed"],
      required: true,
      default: "pending"
    },
    statusCode: { type: Number, default: null },
    responseBody: { type: mongoose.Schema.Types.Mixed, default: null },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true }
  },
  { versionKey: false }
);

idempotencyRecordSchema.index({ key: 1, userId: 1, action: 1 }, { unique: true });
