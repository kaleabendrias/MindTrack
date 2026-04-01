import mongoose from "mongoose";
import { mindTrackClientSchema } from "../schemas/mindTrackClientSchema.js";

export const MindTrackClientModel =
  mongoose.models.MindTrackClient || mongoose.model("MindTrackClient", mindTrackClientSchema);
