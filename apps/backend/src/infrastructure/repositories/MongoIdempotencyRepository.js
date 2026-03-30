import { IdempotencyRecordModel } from "../persistence/models/IdempotencyRecordModel.js";

export class MongoIdempotencyRepository {
  async findByKey({ key, userId, action }) {
    return IdempotencyRecordModel.findOne({ key, userId, action }).lean();
  }

  async create(payload) {
    const created = await IdempotencyRecordModel.create(payload);
    return created.toObject();
  }
}
