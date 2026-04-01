import { AuditLogRepository } from "../../domain/repositories/AuditLogRepository.js";
import { AuditLogModel } from "../persistence/models/AuditLogModel.js";

export class MongoAuditLogRepository extends AuditLogRepository {
  async create(payload) {
    await AuditLogModel.create(payload);
  }
}
