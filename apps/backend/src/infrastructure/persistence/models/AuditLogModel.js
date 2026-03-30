import mongoose from "mongoose";
import { auditLogSchema } from "../schemas/auditLogSchema.js";

export const AuditLogModel =
  mongoose.models.AuditLog || mongoose.model("AuditLog", auditLogSchema);
