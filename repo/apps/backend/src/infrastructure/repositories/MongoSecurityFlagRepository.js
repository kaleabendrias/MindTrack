import { SecurityFlagRepository } from "../../domain/repositories/SecurityFlagRepository.js";
import { SecurityFlagModel } from "../persistence/models/SecurityFlagModel.js";

export class MongoSecurityFlagRepository extends SecurityFlagRepository {
  async create(payload) {
    await SecurityFlagModel.create(payload);
  }

  async listByUserId(userId) {
    return SecurityFlagModel.find({ userId }).sort({ createdAt: -1 }).lean();
  }
}
