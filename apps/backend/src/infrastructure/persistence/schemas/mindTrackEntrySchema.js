import mongoose from "mongoose";

const attachmentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    type: { type: String, required: true },
    sizeBytes: { type: Number, required: true },
    fingerprint: { type: String, required: true }
  },
  { _id: false }
);

export const mindTrackEntrySchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    clientId: { type: String, required: true, index: true },
    clinicianId: { type: String, required: true },
    entryType: {
      type: String,
      enum: ["assessment", "counseling_note", "follow_up"],
      required: true
    },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    body: { type: String, required: true, trim: true, maxlength: 4000 },
    tags: { type: [String], default: [] },
    channel: {
      type: String,
      enum: ["in_person", "telehealth", "phone", "self_service"],
      required: true
    },
    status: { type: String, enum: ["draft", "signed", "amended"], required: true },
    occurredAt: { type: Date, required: true },
    attachments: { type: [attachmentSchema], default: [] },
    amendedFromEntryId: { type: String, default: null },
    deletedAt: { type: Date, default: null },
    deletedReason: { type: String, default: null },
    legalHold: { type: Boolean, default: false },
    retentionUntil: { type: Date, required: true },
    version: { type: Number, required: true, default: 1 },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true }
  },
  { versionKey: false }
);

mindTrackEntrySchema.index({ title: "text", body: "text", tags: "text" });
