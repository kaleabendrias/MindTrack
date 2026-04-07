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
    seenNonces: (doc.seenNonces || []).map((entry) => ({
      nonce: entry.nonce,
      seenAt: entry.seenAt
    })),
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
      seenNonces: payload.seenNonces || [],
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

  /**
   * Atomically register a nonce for a session, enforcing replay prevention
   * within a sliding TTL window. Returns true on success, false if the
   * nonce was already seen within the window.
   *
   * Implementation:
   *   1. Prune expired nonces (`$pull` where seenAt < cutoff).
   *   2. Conditional update: only insert the new nonce if no surviving
   *      nonce in the array matches it. Mongo's `$ne` against an array
   *      element on the same field path resolves "no element equals X".
   */
  async recordNonce(id, nonce, ttlMs) {
    const cutoff = new Date(Date.now() - ttlMs);
    await SessionModel.updateOne(
      { _id: id },
      { $pull: { seenNonces: { seenAt: { $lt: cutoff } } } }
    );
    const result = await SessionModel.updateOne(
      { _id: id, "seenNonces.nonce": { $ne: nonce } },
      {
        $push: { seenNonces: { nonce, seenAt: new Date() } },
        $set: { lastNonce: nonce }
      }
    );
    return result.modifiedCount === 1;
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
