import mongoose from "mongoose";
import { searchEventSchema } from "../schemas/searchEventSchema.js";

export const SearchEventModel =
  mongoose.models.SearchEvent || mongoose.model("SearchEvent", searchEventSchema);
