import crypto from "node:crypto";

export class AuditService {
  constructor(auditLogRepository) {
    this.auditLogRepository = auditLogRepository;
  }

  async logAction({ actorUserId, action, entityType, entityId, reason, before, after, metadata }) {
    await this.auditLogRepository.create({
      _id: crypto.randomUUID().replaceAll("-", ""),
      actorUserId,
      action,
      entityType,
      entityId,
      reason,
      before: before || null,
      after: after || null,
      metadata: metadata || {},
      createdAt: new Date()
    });
  }
}
