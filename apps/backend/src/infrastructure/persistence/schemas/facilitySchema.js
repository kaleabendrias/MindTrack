import mongoose from "mongoose";

export const facilitySchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    address: { type: String, required: true, trim: true, maxlength: 250 },
    zip: { type: String, required: true },
    coordinate: {
      lat: { type: Number, required: true },
      lon: { type: Number, required: true }
    },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true }
  },
  { versionKey: false }
);
