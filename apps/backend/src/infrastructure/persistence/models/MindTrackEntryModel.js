import mongoose from "mongoose";
import { mindTrackEntrySchema } from "../schemas/mindTrackEntrySchema.js";

export const MindTrackEntryModel =
  mongoose.models.MindTrackEntry || mongoose.model("MindTrackEntry", mindTrackEntrySchema);
