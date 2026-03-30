import crypto from "node:crypto";
import { config } from "../../config/index.js";

const KEY = crypto.createHash("sha256").update(config.dataEncryptionKey).digest();

export function encryptValue(plainText) {
  if (!plainText) {
    return null;
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const encrypted = Buffer.concat([
    cipher.update(String(plainText), "utf8"),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();

  return {
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: encrypted.toString("base64")
  };
}

export function decryptValue(cipherPayload) {
  if (!cipherPayload || !cipherPayload.iv || !cipherPayload.tag || !cipherPayload.data) {
    return "";
  }

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    KEY,
    Buffer.from(cipherPayload.iv, "base64")
  );
  decipher.setAuthTag(Buffer.from(cipherPayload.tag, "base64"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(cipherPayload.data, "base64")),
    decipher.final()
  ]);

  return decrypted.toString("utf8");
}
