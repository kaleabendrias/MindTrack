import mongoose from "mongoose";
import { systemSettingsSchema } from "../schemas/systemSettingsSchema.js";

export const SystemSettingsModel =
  mongoose.models.SystemSettings || mongoose.model("SystemSettings", systemSettingsSchema);
