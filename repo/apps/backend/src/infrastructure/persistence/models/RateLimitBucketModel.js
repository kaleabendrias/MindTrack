import mongoose from "mongoose";
import { rateLimitBucketSchema } from "../schemas/rateLimitBucketSchema.js";

export const RateLimitBucketModel =
  mongoose.models.RateLimitBucket ||
  mongoose.model("RateLimitBucket", rateLimitBucketSchema);
