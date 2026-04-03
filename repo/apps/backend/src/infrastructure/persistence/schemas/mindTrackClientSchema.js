import mongoose from "mongoose";

const encryptedFieldSchema = new mongoose.Schema(
  {
    iv: { type: String, required: true },
    tag: { type: String, required: true },
    data: { type: String, required: true }
  },
  { _id: false }
);

const coordinateSchema = new mongoose.Schema(
  {
    lat: { type: Number, required: true },
    lon: { type: Number, required: true },
    source: { type: String, enum: ["facility", "zip_centroid", "manual"], required: true }
  },
  { _id: false }
);

export const mindTrackClientSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    dob: { type: Date, required: true },
    encryptedPhone: { type: encryptedFieldSchema, required: true },
    phoneLast4: { type: String, required: true },
    encryptedAddress: { type: encryptedFieldSchema, required: true },
    tags: { type: [String], default: [] },
    channel: { type: String, enum: ["in_person", "telehealth", "phone"], required: true },
    coordinate: { type: coordinateSchema, default: null },
    primaryClinicianId: { type: String, required: true },
    legalHold: { type: Boolean, default: false },
    retentionUntil: { type: Date, required: true },
    mergedIntoClientId: { type: String, default: null },
    mergedAt: { type: Date, default: null },
    customFields: { type: mongoose.Schema.Types.Mixed, default: {} },
    createdBy: { type: String, required: true },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true }
  },
  { versionKey: false }
);

mindTrackClientSchema.index({ name: 1, dob: 1, phoneLast4: 1 });
