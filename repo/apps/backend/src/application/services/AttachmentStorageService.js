import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../../config/index.js";

export class AttachmentStorageService {
  constructor() {
    this.baseDir = config.attachmentDirectory;
  }

  async ensureDir(dirPath) {
    await fs.mkdir(dirPath, { recursive: true });
  }

  entryDir(entryId) {
    return path.join(this.baseDir, entryId);
  }

  filePath(entryId, fingerprint, originalName) {
    const ext = path.extname(originalName) || "";
    return path.join(this.entryDir(entryId), `${fingerprint}${ext}`);
  }

  async store(entryId, attachments) {
    const stored = [];
    const dir = this.entryDir(entryId);
    await this.ensureDir(dir);

    for (const attachment of attachments) {
      if (!attachment.data) {
        stored.push({
          name: attachment.name,
          type: attachment.type,
          sizeBytes: attachment.sizeBytes,
          fingerprint: attachment.fingerprint,
          storagePath: null
        });
        continue;
      }

      const buffer = Buffer.from(attachment.data, "base64");
      const fileDest = this.filePath(entryId, attachment.fingerprint, attachment.name);
      await fs.writeFile(fileDest, buffer);

      stored.push({
        name: attachment.name,
        type: attachment.type,
        sizeBytes: attachment.sizeBytes,
        fingerprint: attachment.fingerprint,
        storagePath: fileDest
      });
    }

    return stored;
  }

  async retrieve(storagePath) {
    const buffer = await fs.readFile(storagePath);
    return buffer;
  }

  async exists(storagePath) {
    try {
      await fs.access(storagePath);
      return true;
    } catch {
      return false;
    }
  }
}
