import mongoose from "mongoose";

export const mindTrackTemplateSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    body: { type: String, required: true, trim: true, maxlength: 4000 },
    tags: { type: [String], default: [] },
    entryType: {
      type: String,
      enum: ["assessment", "counseling_note", "follow_up"],
      required: true
    },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true }
  },
  { versionKey: false }
);

mindTrackTemplateSchema.index({ title: "text", body: "text", tags: "text" });
