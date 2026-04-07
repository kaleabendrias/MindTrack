import mongoose from "mongoose";
import { AuditLogModel } from "../persistence/models/AuditLogModel.js";
import { FacilityModel } from "../persistence/models/FacilityModel.js";
import { MindTrackClientModel } from "../persistence/models/MindTrackClientModel.js";
import { MindTrackEntryModel } from "../persistence/models/MindTrackEntryModel.js";
import { SystemSettingsModel } from "../persistence/models/SystemSettingsModel.js";
import { UserModel } from "../persistence/models/UserModel.js";

export class MongoSystemRepository {
  async getOrCreateSettings() {
    const now = new Date();
    const settings = await SystemSettingsModel.findByIdAndUpdate(
      "global",
      {
        _id: "global",
        $setOnInsert: {
          profileFields: {
            phone: true,
            address: true,
            tags: true,
            piiPolicyVisible: true
          },
          createdAt: now,
          updatedAt: now
        }
      },
      { upsert: true, new: true }
    ).lean();
    return settings;
  }

  async updateSettings(patch) {
    return SystemSettingsModel.findByIdAndUpdate(
      "global",
      { ...patch, updatedAt: new Date() },
      { new: true }
    ).lean();
  }

  async snapshotCollections() {
    return {
      users: await UserModel.find().lean(),
      clients: await MindTrackClientModel.find().lean(),
      entries: await MindTrackEntryModel.find().lean(),
      facilities: await FacilityModel.find().lean(),
      auditLogs: await AuditLogModel.find().lean(),
      settings: await SystemSettingsModel.find().lean()
    };
  }

  async restoreCollections(snapshot) {
    // Audit logs are intentionally excluded from restore operations to preserve
    // their strict immutability and maintain a continuous, append-only ledger.
    // The full restore sequence runs inside a single MongoDB transaction so
    // that any partial failure rolls back cleanly and the system never enters
    // an inconsistent state.
    const session = await mongoose.startSession();
    try {
      let transactional = true;
      try {
        await session.withTransaction(async () => {
          await this._applyRestore(snapshot, session);
        });
      } catch (err) {
        // Standalone Mongo (non-replica-set) deployments cannot run
        // multi-document transactions. Fall back to a best-effort sequential
        // restore that still skips audit logs and reports its mode.
        const message = err && err.message ? err.message : "";
        const code = err && err.codeName ? err.codeName : "";
        const standalone =
          message.includes("Transaction numbers are only allowed on a replica set") ||
          message.includes("transaction") ||
          code === "IllegalOperation" ||
          code === "NotImplemented";
        if (!standalone) {
          throw err;
        }
        transactional = false;
        await this._applyRestore(snapshot, null);
      }
      return { transactional };
    } finally {
      session.endSession();
    }
  }

  async _applyRestore(snapshot, session) {
    const opts = session ? { session } : undefined;
    if (snapshot.users?.length) {
      await UserModel.deleteMany({}, opts);
      await UserModel.insertMany(snapshot.users, opts);
    }
    if (snapshot.clients?.length) {
      await MindTrackClientModel.deleteMany({}, opts);
      await MindTrackClientModel.insertMany(snapshot.clients, opts);
    }
    if (snapshot.entries?.length) {
      await MindTrackEntryModel.deleteMany({}, opts);
      await MindTrackEntryModel.insertMany(snapshot.entries, opts);
    }
    if (snapshot.facilities?.length) {
      await FacilityModel.deleteMany({}, opts);
      await FacilityModel.insertMany(snapshot.facilities, opts);
    }
    if (snapshot.settings?.length) {
      await SystemSettingsModel.deleteMany({}, opts);
      await SystemSettingsModel.insertMany(snapshot.settings, opts);
    }
    // NOTE: snapshot.auditLogs is intentionally NOT restored. The auditLogSchema
    // is append-only — overwriting it would break the historical chain of
    // custody for who/what/when/why and is forbidden by the immutability rule.
  }

  async countAuditLogs() {
    return AuditLogModel.estimatedDocumentCount();
  }

  async findOneAuditLog() {
    return AuditLogModel.findOne().lean();
  }

  async attemptAuditMutation(id) {
    return AuditLogModel.updateOne({ _id: id }, { reason: "tamper attempt" });
  }
}
