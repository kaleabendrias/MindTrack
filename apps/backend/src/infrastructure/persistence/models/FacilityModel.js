import mongoose from "mongoose";
import { facilitySchema } from "../schemas/facilitySchema.js";

export const FacilityModel =
  mongoose.models.Facility || mongoose.model("Facility", facilitySchema);
