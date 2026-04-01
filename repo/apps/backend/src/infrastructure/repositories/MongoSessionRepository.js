import { SessionRepository } from "../../domain/repositories/SessionRepository.js";
import { SessionModel } from "../persistence/models/SessionModel.js";

function map(doc) {
  if (!doc) {
    return null;
  }

  return {
    id: doc._id,
    userId: doc.userId,
    refreshTokenHash: doc.refreshTokenHash,
    requestSigningKey: doc.requestSigningKey,
    createdAt: doc.createdAt,
    expiresAt: doc.expiresAt,
    revokedAt: doc.revokedAt,
    lastSeenAt: doc.lastSeenAt,
    csrfToken: doc.csrfToken,
    ipHistory: doc.ipHistory || [],
    userAgentHistory: doc.userAgentHistory || [],
    lastNonce: doc.lastNonce || null,
    activityHistory: doc.activityHistory || []
  };
}

export class MongoSessionRepository extends SessionRepository {
  async create(payload) {
    const created = await SessionModel.create({
      _id: payload.id,
      userId: payload.userId,
      refreshTokenHash: payload.refreshTokenHash,
      requestSigningKey: payload.requestSigningKey,
      createdAt: payload.createdAt,
      expiresAt: payload.expiresAt,
      revokedAt: null,
      lastSeenAt: payload.lastSeenAt || null,
      csrfToken: payload.csrfToken,
      ipHistory: payload.ipHistory || [],
      userAgentHistory: payload.userAgentHistory || [],
      lastNonce: payload.lastNonce || null,
      activityHistory: payload.activityHistory || []
    });
    return map(created.toObject());
  }

  async findById(id) {
    const doc = await SessionModel.findById(id).lean();
    return map(doc);
  }

  async update(id, payload) {
    const updated = await SessionModel.findByIdAndUpdate(id, payload, { new: true }).lean();
    return map(updated);
  }

  async revoke(id) {
    const updated = await SessionModel.findByIdAndUpdate(
      id,
      { revokedAt: new Date() },
      { new: true }
    ).lean();
    return map(updated);
  }
}
