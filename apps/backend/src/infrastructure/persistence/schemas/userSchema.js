import mongoose from "mongoose";

const securityQuestionSchema = new mongoose.Schema(
  {
    question: { type: String, required: true, trim: true, maxlength: 200 },
    answerHash: { type: String, required: true }
  },
  { _id: false }
);

const encryptedFieldSchema = new mongoose.Schema(
  {
    iv: { type: String, required: true },
    tag: { type: String, required: true },
    data: { type: String, required: true }
  },
  { _id: false }
);

export const userSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    username: { type: String, required: true, unique: true, trim: true, lowercase: true },
    role: { type: String, enum: ["administrator", "clinician", "client"], required: true },
    mindTrackClientId: { type: String, default: null },
    permissions: { type: [String], default: [] },
    passwordHash: { type: String, required: true },
    securityQuestions: { type: [securityQuestionSchema], default: [] },
    encryptedPhone: { type: encryptedFieldSchema, default: null },
    encryptedAddress: { type: encryptedFieldSchema, default: null },
    failedLoginAttempts: { type: Number, default: 0 },
    lockedUntil: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true }
  },
  {
    versionKey: false
  }
);
