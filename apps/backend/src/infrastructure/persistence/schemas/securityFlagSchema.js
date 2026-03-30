import mongoose from "mongoose";

export const securityFlagSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true, index: true },
    sessionId: { type: String, required: true },
    kind: { type: String, required: true },
    ruleCode: { type: String, required: true },
    details: { type: mongoose.Schema.Types.Mixed, default: {} },
    createdAt: { type: Date, required: true }
  },
  {
    versionKey: false
  }
);
