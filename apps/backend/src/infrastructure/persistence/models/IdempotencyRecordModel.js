import mongoose from "mongoose";
import { idempotencyRecordSchema } from "../schemas/idempotencyRecordSchema.js";

export const IdempotencyRecordModel =
  mongoose.models.IdempotencyRecord ||
  mongoose.model("IdempotencyRecord", idempotencyRecordSchema);
