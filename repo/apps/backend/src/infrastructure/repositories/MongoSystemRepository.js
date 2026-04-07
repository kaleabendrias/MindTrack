import mongoose from "mongoose";
import { AppError } from "../../domain/errors/AppError.js";
import { AuditLogModel } from "../persistence/models/AuditLogModel.js";

function makeReplicaSetError(detail) {
  return new AppError(
    `restore requires a MongoDB replica set: ${detail}`,
    503,
    "RESTORE_REQUIRES_REPLICA_SET"
  );
}
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

  /**
   * Restore the application's collections from a snapshot, atomically.
   *
   * Hard requirements:
   *   1. The deployment MUST be running against a MongoDB replica set
   *      (`rs.status().ok === 1`). Standalone instances are rejected before
   *      any destructive write so the system fails closed instead of
   *      degrading to a non-atomic restore.
   *   2. The audit log collection (auditLogSchema) is never written by
   *      restore — it is append-only and immutable.
   *   3. The whole sequence runs inside a single multi-document transaction;
   *      any failure aborts the transaction and the database is left in its
   *      pre-restore state.
   *
   * On a standalone deployment the method throws `RESTORE_REQUIRES_REPLICA_SET`
   * BEFORE deleting anything. There is no longer a "best-effort sequential"
   * fallback path — partial-state corruption is unacceptable.
   */
  async restoreCollections(snapshot) {
    await this.assertReplicaSet();

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await this._applyRestore(snapshot, session);
      });
      return { transactional: true };
    } finally {
      session.endSession();
    }
  }

  /**
   * Verify that the connected MongoDB instance is a replica-set primary.
   * Cached after the first successful check so the runtime cost is one
   * `replSetGetStatus` call per process. The check throws an `AppError`
   * with `RESTORE_REQUIRES_REPLICA_SET` so the caller can surface a
   * meaningful 4xx/5xx without exposing Mongo internals.
   */
  async assertReplicaSet() {
    if (this._replicaSetVerified) {
      return;
    }
    const conn = mongoose.connection;
    if (!conn || conn.readyState !== 1 || !conn.db) {
      throw makeReplicaSetError("mongo connection is not ready");
    }
    let status;
    try {
      status = await conn.db.admin().command({ replSetGetStatus: 1 });
    } catch (err) {
      throw makeReplicaSetError(
        `replica set status check failed: ${err && err.message ? err.message : err}`
      );
    }
    if (!status || status.ok !== 1 || !Array.isArray(status.members)) {
      throw makeReplicaSetError("mongo is not running as a replica set");
    }
    this._replicaSetVerified = true;
  }

  async _applyRestore(snapshot, session) {
    const opts = { session };
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
    // NOTE: snapshot.auditLogs is intentionally NOT restored. The
    // auditLogSchema is append-only — overwriting it would break the
    // historical chain of custody for who/what/when/why and is forbidden
    // by the immutability rule.
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
