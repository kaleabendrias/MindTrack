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

  async findOneAuditLog() {
    return AuditLogModel.findOne().lean();
  }

  async attemptAuditMutation(id) {
    return AuditLogModel.updateOne({ _id: id }, { reason: "tamper attempt" });
  }
}
