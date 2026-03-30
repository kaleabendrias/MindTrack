import mongoose from "mongoose";

export const sessionSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true, index: true },
    refreshTokenHash: { type: String, required: true },
    requestSigningKey: { type: String, required: true },
    createdAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true, index: true },
    revokedAt: { type: Date, default: null },
    lastSeenAt: { type: Date, default: null },
    csrfToken: { type: String, required: true },
    ipHistory: { type: [String], default: [] },
    userAgentHistory: { type: [String], default: [] },
    lastNonce: { type: String, default: null },
    activityHistory: { type: [mongoose.Schema.Types.Mixed], default: [] }
  },
  {
    versionKey: false
  }
);
