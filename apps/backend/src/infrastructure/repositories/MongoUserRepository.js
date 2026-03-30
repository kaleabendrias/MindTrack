import { UserRepository } from "../../domain/repositories/UserRepository.js";
import { UserModel } from "../persistence/models/UserModel.js";
import { decryptValue, encryptValue } from "../security/fieldCrypto.js";

function toEntity(doc, includePii = true) {
  if (!doc) {
    return null;
  }

  return {
    id: doc._id,
    username: doc.username,
    role: doc.role,
    mindTrackClientId: doc.mindTrackClientId || null,
    permissions: doc.permissions,
    passwordHash: doc.passwordHash,
    securityQuestions: doc.securityQuestions,
    phone: includePii ? decryptValue(doc.encryptedPhone) : "",
    address: includePii ? decryptValue(doc.encryptedAddress) : "",
    failedLoginAttempts: doc.failedLoginAttempts,
    lockedUntil: doc.lockedUntil,
    lastLoginAt: doc.lastLoginAt,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  };
}

export class MongoUserRepository extends UserRepository {
  async findById(id) {
    const doc = await UserModel.findById(id).lean();
    return toEntity(doc);
  }

  async findByUsername(username) {
    const doc = await UserModel.findOne({ username }).lean();
    return toEntity(doc);
  }

  async create(payload) {
    const now = new Date();
    const created = await UserModel.create({
      _id: payload.id,
      username: payload.username,
      role: payload.role,
      mindTrackClientId: payload.mindTrackClientId || null,
      permissions: payload.permissions,
      passwordHash: payload.passwordHash,
      securityQuestions: payload.securityQuestions,
      encryptedPhone: encryptValue(payload.phone),
      encryptedAddress: encryptValue(payload.address),
      failedLoginAttempts: 0,
      lockedUntil: null,
      createdAt: now,
      updatedAt: now
    });

    return toEntity(created.toObject());
  }

  async update(id, payload) {
    const updateDoc = {
      ...payload,
      updatedAt: new Date()
    };

    if (Object.prototype.hasOwnProperty.call(payload, "phone")) {
      updateDoc.encryptedPhone = encryptValue(payload.phone);
      delete updateDoc.phone;
    }

    if (Object.prototype.hasOwnProperty.call(payload, "address")) {
      updateDoc.encryptedAddress = encryptValue(payload.address);
      delete updateDoc.address;
    }

    const updated = await UserModel.findByIdAndUpdate(id, updateDoc, { new: true }).lean();
    return toEntity(updated);
  }

  async list() {
    const docs = await UserModel.find().sort({ createdAt: -1 }).lean();
    return docs.map((doc) => toEntity(doc));
  }
}
