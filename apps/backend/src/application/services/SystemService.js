import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { AppError } from "../../domain/errors/AppError.js";
import { config } from "../../config/index.js";

const backupState = {
  schedule: "0 0 * * *",
  destination: config.backupDirectory,
  lastRunAt: null,
  timer: null,
  lastScheduledRunDate: null
};

function getBackupKey() {
  return crypto.createHash("sha256").update(config.dataEncryptionKey).digest();
}

function encryptBuffer(buffer) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getBackupKey(), iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  return JSON.stringify({
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: encrypted.toString("base64")
  });
}

export class SystemService {
  constructor(systemRepository, auditService, securityMonitoringService) {
    this.systemRepository = systemRepository;
    this.auditService = auditService;
    this.securityMonitoringService = securityMonitoringService;
  }

  start() {
    if (backupState.timer) {
      return;
    }

    backupState.timer = setInterval(async () => {
      const now = new Date();
      const today = now.toISOString().slice(0, 10);
      if (now.getUTCHours() === 0 && backupState.lastScheduledRunDate !== today) {
        backupState.lastScheduledRunDate = today;
        await this.runBackupNow({
          actor: { id: "system", username: "system" },
          reason: "nightly scheduled backup"
        });
      }
    }, 60 * 60 * 1000);
  }

  getOfflinePolicy() {
    return {
      mode: "offline_only",
      externalNetworkAllowed: false,
      externalIntegrationsEnabled: false
    };
  }

  async getBackupStatus(now = new Date()) {
    await fs.mkdir(backupState.destination, { recursive: true });
    const files = await fs.readdir(backupState.destination);
    const backupFiles = files.filter((file) => file.endsWith(".enc.json")).sort();
    const nextRunAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));

    return {
      schedule: backupState.schedule,
      destination: backupState.destination,
      lastRunAt: backupState.lastRunAt,
      nextRunAt: nextRunAt.toISOString(),
      retentionDays: 30,
      backups: backupFiles
    };
  }

  async pruneExpiredBackups() {
    await fs.mkdir(backupState.destination, { recursive: true });
    const files = await fs.readdir(backupState.destination);
    const now = Date.now();
    await Promise.all(
      files
        .filter((file) => file.endsWith(".enc.json"))
        .map(async (file) => {
          const fullPath = path.join(backupState.destination, file);
          const stat = await fs.stat(fullPath);
          if (now - stat.mtimeMs > 30 * 24 * 60 * 60 * 1000) {
            await fs.unlink(fullPath);
          }
        })
    );
  }

  async runBackupNow({ actor, reason }) {
    await fs.mkdir(backupState.destination, { recursive: true });

    const before = await this.getBackupStatus();
    const snapshot = {
      generatedAt: new Date().toISOString(),
      ...(await this.systemRepository.snapshotCollections())
    };

    const encryptedPayload = encryptBuffer(Buffer.from(JSON.stringify(snapshot), "utf8"));
    const filename = `mindtrack-backup-${snapshot.generatedAt.replace(/[:.]/g, "-")}.enc.json`;
    const fullPath = path.join(backupState.destination, filename);
    await fs.writeFile(fullPath, encryptedPayload, "utf8");
    backupState.lastRunAt = snapshot.generatedAt;
    await this.pruneExpiredBackups();
    const after = await this.getBackupStatus();

    await this.auditService.logAction({
      actorUserId: actor.id,
      action: "create",
      entityType: "backup_execution",
      entityId: filename,
      reason,
      before,
      after
    });

    return {
      success: true,
      lastRunAt: backupState.lastRunAt,
      file: filename
    };
  }

  async auditImmutabilityCheck() {
    const one = await this.systemRepository.findOneAuditLog();
    if (!one) {
      return { checked: false, immutable: true };
    }

    try {
      await this.systemRepository.attemptAuditMutation(one._id);
      return { checked: true, immutable: false };
    } catch (_error) {
      return { checked: true, immutable: true };
    }
  }

  async getProfileFields() {
    const settings = await this.systemRepository.getOrCreateSettings();
    return settings.profileFields;
  }

  async updateProfileFields({ actor, profileFields, reason }) {
    const safeProfileFields = {
      phone: Boolean(profileFields?.phone),
      address: Boolean(profileFields?.address),
      tags: Boolean(profileFields?.tags),
      piiPolicyVisible: Boolean(profileFields?.piiPolicyVisible)
    };
    const beforeSettings = await this.systemRepository.getOrCreateSettings();
    const updated = await this.systemRepository.updateSettings({ profileFields: safeProfileFields });

    await this.auditService.logAction({
      actorUserId: actor.id,
      action: "update",
      entityType: "profile_fields",
      entityId: "global",
      reason: reason || "profile field update",
      before: beforeSettings.profileFields,
      after: updated.profileFields
    });

    return updated.profileFields;
  }

  async securityFlags(userId) {
    return this.securityMonitoringService.listFlagsForUser(userId);
  }
}
