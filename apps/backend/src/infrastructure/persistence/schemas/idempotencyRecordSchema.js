import mongoose from "mongoose";

export const idempotencyRecordSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    key: { type: String, required: true },
    userId: { type: String, required: true },
    action: { type: String, required: true },
    statusCode: { type: Number, required: true },
    responseBody: { type: mongoose.Schema.Types.Mixed, required: true },
    createdAt: { type: Date, required: true }
  },
  { versionKey: false }
);

idempotencyRecordSchema.index({ key: 1, userId: 1, action: 1 }, { unique: true });
