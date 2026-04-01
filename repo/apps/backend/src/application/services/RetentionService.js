export class RetentionService {
  static canModifyRecord(record, now = new Date()) {
    if (record.legalHold) {
      return {
        allowed: false,
        reason: "legal_hold"
      };
    }

    if (record.retentionUntil && new Date(record.retentionUntil) <= now) {
      return {
        allowed: false,
        reason: "retention_expired_archive_locked"
      };
    }

    return {
      allowed: true,
      reason: "ok"
    };
  }
}
