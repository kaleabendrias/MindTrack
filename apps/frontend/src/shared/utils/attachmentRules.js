export const ALLOWED_ATTACHMENT_TYPES = ["application/pdf", "image/jpeg", "image/png"];
export const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_ENTRY = 20;

export function validateAttachmentMeta(existingItems, candidateItems) {
  const existing = existingItems || [];
  const incoming = candidateItems || [];

  if (existing.length + incoming.length > MAX_ATTACHMENTS_PER_ENTRY) {
    return "Maximum 20 files per entry.";
  }

  const seen = new Set(existing.map((item) => item.fingerprint));
  for (const item of incoming) {
    if (!ALLOWED_ATTACHMENT_TYPES.includes(item.type)) {
      return "Only PDF, JPG and PNG files are allowed.";
    }
    if (Number(item.sizeBytes) > MAX_ATTACHMENT_SIZE_BYTES) {
      return "Each file must be 10 MB or less.";
    }
    if (seen.has(item.fingerprint)) {
      return `Duplicate upload blocked: ${item.name}`;
    }
    seen.add(item.fingerprint);
  }

  return "";
}
