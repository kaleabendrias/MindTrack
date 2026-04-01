import mongoose from "mongoose";
import { workOrderSchema } from "../schemas/workOrderSchema.js";

export const WorkOrderModel =
  mongoose.models.WorkOrder || mongoose.model("WorkOrder", workOrderSchema);
