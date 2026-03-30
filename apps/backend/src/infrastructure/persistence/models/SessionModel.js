import mongoose from "mongoose";
import { sessionSchema } from "../schemas/sessionSchema.js";

export const SessionModel =
  mongoose.models.Session || mongoose.model("Session", sessionSchema);
