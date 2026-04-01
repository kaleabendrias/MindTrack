import mongoose from "mongoose";
import { workOrderEnums } from "../../../domain/models/WorkOrder.js";

export const workOrderSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      required: true
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500
    },
    status: {
      type: String,
      enum: workOrderEnums.statuses,
      default: "queued"
    },
    assignedRole: {
      type: String,
      enum: workOrderEnums.roles,
      required: true
    },
    createdAt: {
      type: Date,
      required: true
    }
  },
  {
    versionKey: false
  }
);
