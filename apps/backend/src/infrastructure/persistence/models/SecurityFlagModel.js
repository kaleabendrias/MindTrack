import mongoose from "mongoose";
import { securityFlagSchema } from "../schemas/securityFlagSchema.js";

export const SecurityFlagModel =
  mongoose.models.SecurityFlag || mongoose.model("SecurityFlag", securityFlagSchema);
