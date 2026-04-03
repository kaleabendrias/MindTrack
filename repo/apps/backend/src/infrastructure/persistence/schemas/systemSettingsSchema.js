import mongoose from "mongoose";

const customProfileFieldSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    fieldType: {
      type: String,
      enum: ["text", "number", "date", "boolean", "select"],
      required: true
    },
    options: { type: [String], default: [] },
    required: { type: Boolean, default: false },
    visibleTo: {
      type: [String],
      default: ["administrator", "clinician", "client"]
    },
    createdAt: { type: Date, required: true }
  },
  { _id: false }
);

export const systemSettingsSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    profileFields: {
      phone: { type: Boolean, default: true },
      address: { type: Boolean, default: true },
      tags: { type: Boolean, default: true },
      piiPolicyVisible: { type: Boolean, default: true }
    },
    customProfileFields: { type: [customProfileFieldSchema], default: [] },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true }
  },
  { versionKey: false }
);
