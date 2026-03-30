import crypto from "node:crypto";
import { AppError } from "../../domain/errors/AppError.js";

export class IdempotencyService {
  constructor(idempotencyRepository) {
    this.idempotencyRepository = idempotencyRepository;
  }

  async execute({ key, userId, action, handler }) {
    if (!key || typeof key !== "string") {
      throw new AppError("x-idempotency-key is required", 400, "IDEMPOTENCY_REQUIRED");
    }

    const existing = await this.idempotencyRepository.findByKey({ key, userId, action });
    if (existing) {
      return {
        idempotentReplay: true,
        statusCode: existing.statusCode,
        body: existing.responseBody
      };
    }

    const result = await handler();

    await this.idempotencyRepository.create({
      _id: crypto.randomUUID().replaceAll("-", ""),
      key,
      userId,
      action,
      statusCode: result.statusCode,
      responseBody: result.body,
      createdAt: new Date()
    });

    return {
      idempotentReplay: false,
      statusCode: result.statusCode,
      body: result.body
    };
  }
}
