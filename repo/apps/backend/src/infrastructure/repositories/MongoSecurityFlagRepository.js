import { SecurityFlagRepository } from "../../domain/repositories/SecurityFlagRepository.js";
import { SecurityFlagModel } from "../persistence/models/SecurityFlagModel.js";

export class MongoSecurityFlagRepository extends SecurityFlagRepository {
  async create(payload) {
    await SecurityFlagModel.create(payload);
  }

  async listByUserId(userId) {
    return SecurityFlagModel.find({ userId }).sort({ createdAt: -1 }).lean();
  }

  async listFiltered({ userId, sessionId, ruleCode, from, to, limit } = {}) {
    const query = {};
    if (userId) {
      query.userId = userId;
    }
    if (sessionId) {
      query.sessionId = sessionId;
    }
    if (ruleCode) {
      query.ruleCode = ruleCode;
    }
    if (from || to) {
      query.createdAt = {};
      if (from) {
        query.createdAt.$gte = from;
      }
      if (to) {
        query.createdAt.$lte = to;
      }
    }
    const cap = Math.min(Math.max(parseInt(limit, 10) || 200, 1), 1000);
    return SecurityFlagModel.find(query).sort({ createdAt: -1 }).limit(cap).lean();
  }
}
