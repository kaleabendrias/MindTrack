import mongoose from "mongoose";
import { AppError } from "../../../domain/errors/AppError.js";

export const auditLogSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    actorUserId: { type: String, required: true },
    action: { type: String, enum: ["create", "update", "delete"], required: true },
    entityType: { type: String, required: true },
    entityId: { type: String, required: true },
    reason: { type: String, required: true },
    before: { type: mongoose.Schema.Types.Mixed, default: null },
    after: { type: mongoose.Schema.Types.Mixed, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    createdAt: { type: Date, required: true }
  },
  {
    versionKey: false
  }
);

function rejectMutation() {
  throw new AppError("audit logs are immutable", 400, "AUDIT_IMMUTABLE");
}

auditLogSchema.pre("findOneAndUpdate", rejectMutation);
auditLogSchema.pre("updateOne", rejectMutation);
auditLogSchema.pre("deleteOne", rejectMutation);
auditLogSchema.pre("deleteMany", rejectMutation);
