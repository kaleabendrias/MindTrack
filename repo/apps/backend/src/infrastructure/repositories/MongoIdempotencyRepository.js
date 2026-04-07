import { IdempotencyRecordModel } from "../persistence/models/IdempotencyRecordModel.js";

export class MongoIdempotencyRepository {
  /**
   * Atomic reserve-or-load. Attempts to insert a brand-new pending record;
   * if the unique index rejects the insert (E11000), reads the existing
   * record and returns it. The caller distinguishes the two cases by the
   * `created` flag in the returned tuple.
   *
   * This is the only correct shape for an idempotency lock — a separate
   * find-then-create has a TOCTOU race where two concurrent callers can
   * both observe "no record" and both go on to run the handler.
   */
  async reserve({ key, userId, action, recordId, now }) {
    try {
      const created = await IdempotencyRecordModel.create({
        _id: recordId,
        key,
        userId,
        action,
        status: "pending",
        statusCode: null,
        responseBody: null,
        createdAt: now,
        updatedAt: now
      });
      return { created: true, record: created.toObject() };
    } catch (err) {
      if (err && err.code === 11000) {
        const existing = await IdempotencyRecordModel.findOne({ key, userId, action }).lean();
        if (existing) {
          return { created: false, record: existing };
        }
      }
      throw err;
    }
  }

  async findByKey({ key, userId, action }) {
    return IdempotencyRecordModel.findOne({ key, userId, action }).lean();
  }

  async markCompleted({ key, userId, action, statusCode, responseBody, now }) {
    return IdempotencyRecordModel.findOneAndUpdate(
      { key, userId, action },
      {
        $set: {
          status: "completed",
          statusCode,
          responseBody,
          updatedAt: now
        }
      },
      { new: true }
    ).lean();
  }

  async markFailed({ key, userId, action, now }) {
    // A failed handler does NOT cache the failure as a success. Instead,
    // we delete the pending record so the next retry can run cleanly. We
    // also constrain the delete to status=pending so that we never wipe a
    // completed record by accident.
    await IdempotencyRecordModel.deleteOne({
      key,
      userId,
      action,
      status: "pending"
    });
    void now;
  }
}
