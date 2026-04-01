import { AppError } from "../errors/AppError.js";

const ALLOWED_STATUSES = ["queued", "in_progress", "done"];
const ALLOWED_ROLES = ["admin", "operator"];

export class WorkOrder {
  constructor({ id, title, description, status, assignedRole, createdAt }) {
    this.id = id;
    this.title = title;
    this.description = description;
    this.status = status;
    this.assignedRole = assignedRole;
    this.createdAt = createdAt;
  }

  static validateForCreate(payload) {
    const { title, description, assignedRole } = payload;

    if (!title || typeof title !== "string" || !title.trim()) {
      throw new AppError("title is required", 400, "INVALID_REQUEST");
    }

    if (!description || typeof description !== "string" || !description.trim()) {
      throw new AppError("description is required", 400, "INVALID_REQUEST");
    }

    if (!ALLOWED_ROLES.includes(assignedRole)) {
      throw new AppError(
        "assignedRole must be one of: admin, operator",
        400,
        "INVALID_REQUEST"
      );
    }
  }

  static validateStatus(status) {
    if (!ALLOWED_STATUSES.includes(status)) {
      throw new AppError(
        "status must be one of: queued, in_progress, done",
        400,
        "INVALID_REQUEST"
      );
    }
  }
}

export const workOrderEnums = {
  statuses: ALLOWED_STATUSES,
  roles: ALLOWED_ROLES
};
