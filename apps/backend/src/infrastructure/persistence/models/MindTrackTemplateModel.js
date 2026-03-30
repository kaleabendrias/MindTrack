import mongoose from "mongoose";
import { mindTrackTemplateSchema } from "../schemas/mindTrackTemplateSchema.js";

export const MindTrackTemplateModel =
  mongoose.models.MindTrackTemplate || mongoose.model("MindTrackTemplate", mindTrackTemplateSchema);
