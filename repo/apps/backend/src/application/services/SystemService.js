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

function decryptBuffer(encryptedJson) {
  const parsed = typeof encryptedJson === "string" ? JSON.parse(encryptedJson) : encryptedJson;
  const iv = Buffer.from(parsed.iv, "base64");
  const tag = Buffer.from(parsed.tag, "base64");
  const data = Buffer.from(parsed.data, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", getBackupKey(), iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted;
}

export class SystemService {
  constructor(systemRepository, auditService, securityMonitoringService, idempotencyService) {
    this.systemRepository = systemRepository;
    this.auditService = auditService;
    this.securityMonitoringService = securityMonitoringService;
    this.idempotencyService = idempotencyService || null;
  }

  start() {
    if (backupState.timer) {
      return;
    }

    this._startupCatchUp().catch((err) => {
      console.error("Backup startup catch-up failed:", err.message);
    });

    this._scheduleNextNightly();
  }

  async _startupCatchUp() {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);

    if (backupState.lastScheduledRunDate === today) {
      return;
    }

    await fs.mkdir(backupState.destination, { recursive: true });
    const files = await fs.readdir(backupState.destination);
    const todayBackup = files.find((f) => f.includes(today.replace(/-/g, "-")) && f.endsWith(".enc.json"));

    if (!todayBackup) {
      backupState.lastScheduledRunDate = today;
      await this.runBackupNow({
        actor: { id: "system", username: "system" },
        reason: "startup catch-up nightly backup"
      });
    } else {
      backupState.lastScheduledRunDate = today;
    }
  }

  _scheduleNextNightly() {
    const now = new Date();
    const nextMidnight = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1,
      0, 0, 0, 0
    ));
    const msUntilMidnight = nextMidnight.getTime() - now.getTime();

    backupState.timer = setTimeout(async () => {
      backupState.timer = null;
      const today = new Date().toISOString().slice(0, 10);
      if (backupState.lastScheduledRunDate !== today) {
        backupState.lastScheduledRunDate = today;
        try {
          await this.runBackupNow({
            actor: { id: "system", username: "system" },
            reason: "nightly scheduled backup"
          });
        } catch (err) {
          console.error("Nightly backup failed:", err.message);
        }
      }
      this._scheduleNextNightly();
    }, msUntilMidnight);

    if (backupState.timer.unref) {
      backupState.timer.unref();
    }
  }

  stop() {
    if (backupState.timer) {
      clearTimeout(backupState.timer);
      backupState.timer = null;
    }
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
    return {
      ...settings.profileFields,
      customProfileFields: settings.customProfileFields || []
    };
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

    return {
      ...updated.profileFields,
      customProfileFields: updated.customProfileFields || []
    };
  }

  async addCustomProfileField({ actor, field, reason }) {
    const settings = await this.systemRepository.getOrCreateSettings();
    const existing = (settings.customProfileFields || []);
    if (existing.some((f) => f.key === field.key)) {
      throw new AppError("custom profile field key already exists", 409, "DUPLICATE_FIELD_KEY");
    }

    const validTypes = ["text", "number", "date", "boolean", "select"];
    if (!validTypes.includes(field.fieldType)) {
      throw new AppError("invalid field type", 400, "INVALID_REQUEST");
    }

    const newField = {
      key: String(field.key).trim().toLowerCase().replace(/[^a-z0-9_]/g, "_"),
      label: String(field.label).trim(),
      fieldType: field.fieldType,
      options: field.fieldType === "select" ? (field.options || []).map(String) : [],
      required: Boolean(field.required),
      visibleTo: Array.isArray(field.visibleTo)
        ? field.visibleTo.filter((r) => ["administrator", "clinician", "client"].includes(r))
        : ["administrator", "clinician", "client"],
      createdAt: new Date()
    };

    const updatedFields = [...existing, newField];
    const updated = await this.systemRepository.updateSettings({ customProfileFields: updatedFields });

    await this.auditService.logAction({
      actorUserId: actor.id,
      action: "create",
      entityType: "custom_profile_field",
      entityId: newField.key,
      reason: reason || "custom profile field created",
      before: null,
      after: newField
    });

    return {
      ...updated.profileFields,
      customProfileFields: updated.customProfileFields || []
    };
  }

  async updateCustomProfileField({ actor, key, updates, reason }) {
    const settings = await this.systemRepository.getOrCreateSettings();
    const fields = [...(settings.customProfileFields || [])];
    const index = fields.findIndex((f) => f.key === key);
    if (index === -1) {
      throw new AppError("custom profile field not found", 404, "FIELD_NOT_FOUND");
    }

    const before = { ...fields[index] };
    if (updates.label !== undefined) {
      fields[index] = { ...fields[index], label: String(updates.label).trim() };
    }
    if (updates.required !== undefined) {
      fields[index] = { ...fields[index], required: Boolean(updates.required) };
    }
    if (updates.visibleTo !== undefined) {
      fields[index] = {
        ...fields[index],
        visibleTo: updates.visibleTo.filter((r) => ["administrator", "clinician", "client"].includes(r))
      };
    }
    if (updates.options !== undefined && fields[index].fieldType === "select") {
      fields[index] = { ...fields[index], options: updates.options.map(String) };
    }

    const updated = await this.systemRepository.updateSettings({ customProfileFields: fields });

    await this.auditService.logAction({
      actorUserId: actor.id,
      action: "update",
      entityType: "custom_profile_field",
      entityId: key,
      reason: reason || "custom profile field updated",
      before,
      after: fields[index]
    });

    return {
      ...updated.profileFields,
      customProfileFields: updated.customProfileFields || []
    };
  }

  async deleteCustomProfileField({ actor, key, reason }) {
    const settings = await this.systemRepository.getOrCreateSettings();
    const fields = [...(settings.customProfileFields || [])];
    const index = fields.findIndex((f) => f.key === key);
    if (index === -1) {
      throw new AppError("custom profile field not found", 404, "FIELD_NOT_FOUND");
    }

    const removed = fields.splice(index, 1)[0];
    const updated = await this.systemRepository.updateSettings({ customProfileFields: fields });

    await this.auditService.logAction({
      actorUserId: actor.id,
      action: "delete",
      entityType: "custom_profile_field",
      entityId: key,
      reason: reason || "custom profile field deleted",
      before: removed,
      after: null
    });

    return {
      ...updated.profileFields,
      customProfileFields: updated.customProfileFields || []
    };
  }

  async listBackupFiles() {
    await fs.mkdir(backupState.destination, { recursive: true });
    const files = await fs.readdir(backupState.destination);
    return files.filter((f) => f.endsWith(".enc.json")).sort().reverse();
  }

  async restoreFromBackup({ actor, filename, reason, idempotencyKey }) {
    if (!filename) {
      throw new AppError("filename is required", 400, "INVALID_REQUEST");
    }
    if (!reason || typeof reason !== "string" || !reason.trim()) {
      throw new AppError("reason is required", 400, "INVALID_REQUEST");
    }
    if (!idempotencyKey || typeof idempotencyKey !== "string") {
      throw new AppError("x-idempotency-key is required for restore", 400, "IDEMPOTENCY_REQUIRED");
    }

    return this.idempotencyService.execute({
      key: idempotencyKey,
      userId: actor.id,
      action: `restore:${filename}`,
      handler: async () => {
        const fullPath = path.join(backupState.destination, filename);
        let raw;
        try {
          raw = await fs.readFile(fullPath, "utf8");
        } catch (_err) {
          throw new AppError("backup file not found", 404, "BACKUP_NOT_FOUND");
        }

        const decrypted = decryptBuffer(raw);
        const snapshot = JSON.parse(decrypted.toString("utf8"));

        await this.systemRepository.restoreCollections(snapshot);

        await this.auditService.logAction({
          actorUserId: actor.id,
          action: "create",
          entityType: "backup_restore",
          entityId: filename,
          reason,
          before: null,
          after: { filename, generatedAt: snapshot.generatedAt }
        });

        return {
          statusCode: 200,
          body: {
            success: true,
            filename,
            generatedAt: snapshot.generatedAt
          }
        };
      }
    });
  }

  async securityFlags(userId) {
    return this.securityMonitoringService.listFlagsForUser(userId);
  }
}
