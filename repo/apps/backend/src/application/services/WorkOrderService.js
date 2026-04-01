import crypto from "node:crypto";
import { AppError } from "../../domain/errors/AppError.js";
import { WorkOrder, workOrderEnums } from "../../domain/models/WorkOrder.js";

export class WorkOrderService {
  constructor(workOrderRepository, auditService) {
    this.workOrderRepository = workOrderRepository;
    this.auditService = auditService;
  }

  async list(role) {
    if (!role) {
      return this.workOrderRepository.findAll();
    }

    if (!workOrderEnums.roles.includes(role)) {
      throw new AppError("role must be one of: admin, operator", 400, "INVALID_ROLE");
    }

    return this.workOrderRepository.findByRole(role);
  }

  async create(payload, actor, reason = "work order creation") {
    WorkOrder.validateForCreate(payload);

    const workOrder = new WorkOrder({
      id: crypto.randomUUID().replaceAll("-", "").slice(0, 24),
      title: payload.title.trim(),
      description: payload.description.trim(),
      status: "queued",
      assignedRole: payload.assignedRole,
      createdAt: new Date().toISOString()
    });

    const created = await this.workOrderRepository.create(workOrder);

    if (this.auditService && actor?.id) {
      await this.auditService.logAction({
        actorUserId: actor.id,
        action: "create",
        entityType: "work_order",
        entityId: created.id,
        reason,
        before: null,
        after: created
      });
    }

    return created;
  }

  async updateStatus(id, status, actor, reason = "work order status update") {
    WorkOrder.validateStatus(status);

    const before = await this.workOrderRepository.findById(id);
    if (!before) {
      throw new AppError("work order not found", 404, "WORK_ORDER_NOT_FOUND");
    }

    const updated = await this.workOrderRepository.updateStatus(id, status);

    if (this.auditService && actor?.id) {
      await this.auditService.logAction({
        actorUserId: actor.id,
        action: "update",
        entityType: "work_order",
        entityId: updated.id,
        reason,
        before,
        after: updated
      });
    }

    return updated;
  }

  async delete(id, actor, reason) {
    if (!reason || typeof reason !== "string" || !reason.trim()) {
      throw new AppError("delete reason is required", 400, "DELETE_REASON_REQUIRED");
    }

    const deleted = await this.workOrderRepository.delete(id);
    if (!deleted) {
      throw new AppError("work order not found", 404, "WORK_ORDER_NOT_FOUND");
    }

    if (this.auditService && actor?.id) {
      await this.auditService.logAction({
        actorUserId: actor.id,
        action: "delete",
        entityType: "work_order",
        entityId: deleted.id,
        reason,
        before: deleted,
        after: null
      });
    }

    return deleted;
  }
}
