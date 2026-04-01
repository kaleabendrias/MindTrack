import mongoose from "mongoose";

export const systemSettingsSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    profileFields: {
      phone: { type: Boolean, default: true },
      address: { type: Boolean, default: true },
      tags: { type: Boolean, default: true },
      piiPolicyVisible: { type: Boolean, default: true }
    },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true }
  },
  { versionKey: false }
);
