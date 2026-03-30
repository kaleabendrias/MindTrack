import mongoose from "mongoose";

export const searchEventSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true },
    query: { type: String, required: true },
    terms: { type: [String], default: [] },
    createdAt: { type: Date, required: true }
  },
  { versionKey: false }
);

searchEventSchema.index({ createdAt: -1 });
