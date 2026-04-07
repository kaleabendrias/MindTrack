import crypto from "node:crypto";

// Activity-kind taxonomy. Adding a new monitored behavior is a one-line
// change here plus a matching `RULE_*` constant. Each `kind` MUST have
// exactly one semantic meaning so that downstream alerting (and the
// global admin /security-flags filter) can address it precisely.
export const ACTIVITY_KINDS = Object.freeze({
  RECORD_LOOKUP: "record_lookup",
  BACKUP_ATTEMPT: "backup_attempt",
  EXPORT_ATTEMPT: "export_attempt",
  GENERIC: "generic"
});

// Rule definitions are the public taxonomy of detection. Each rule is
// scoped to exactly one activity kind so that "repeated backup runs"
// and "repeated export attempts" are NEVER conflated even if they
// happen to share a code path in the future.
const RULES = Object.freeze({
  RAPID_RECORD_LOOKUP: {
    code: "RULE_RAPID_RECORD_LOOKUP",
    kind: ACTIVITY_KINDS.RECORD_LOOKUP,
    flagKind: "abnormal_lookup_volume",
    windowMs: 60_000,
    threshold: 8
  },
  REPEATED_BACKUP_EXECUTION: {
    code: "RULE_REPEATED_BACKUP_EXECUTION",
    kind: ACTIVITY_KINDS.BACKUP_ATTEMPT,
    flagKind: "repeated_backup_attempts",
    windowMs: 10 * 60_000,
    threshold: 3
  },
  REPEATED_EXPORT_ATTEMPT: {
    code: "RULE_REPEATED_EXPORT_ATTEMPT",
    kind: ACTIVITY_KINDS.EXPORT_ATTEMPT,
    flagKind: "repeated_export_attempts",
    windowMs: 10 * 60_000,
    threshold: 3
  }
});

// Backwards-compatible aliases for tests/external code that imported the
// old constants from this module.
const LOOKUP_WINDOW_MS = RULES.RAPID_RECORD_LOOKUP.windowMs;
const LOOKUP_THRESHOLD = RULES.RAPID_RECORD_LOOKUP.threshold;
const BACKUP_WINDOW_MS = RULES.REPEATED_BACKUP_EXECUTION.windowMs;
const BACKUP_THRESHOLD = RULES.REPEATED_BACKUP_EXECUTION.threshold;

// Path classifier — maps the raw HTTP request to a single activity
// kind. Centralizing this here means future endpoints only need to be
// added in ONE place to be monitored.
function classifyRequest(method, path) {
  if (method === "GET") {
    if (
      path.startsWith("/api/v1/mindtrack/clients") ||
      path.startsWith("/api/v1/mindtrack/self-context") ||
      path.includes("/timeline")
    ) {
      return ACTIVITY_KINDS.RECORD_LOOKUP;
    }
    // Reads of attachment binaries are treated as exports — they are
    // the canonical mechanism by which a user can pull PHI off the
    // system in bulk.
    if (
      path.includes("/attachments/") ||
      path.startsWith("/api/v1/mindtrack/search") ||
      path.startsWith("/api/v1/system/backup-files")
    ) {
      return ACTIVITY_KINDS.EXPORT_ATTEMPT;
    }
  }
  if (method === "POST") {
    if (path === "/api/v1/system/backup-run") {
      return ACTIVITY_KINDS.BACKUP_ATTEMPT;
    }
    if (path === "/api/v1/system/backup-restore") {
      // backup-restore is a write that replaces state, NOT an export of
      // state. It belongs to its own future rule but for now keeps the
      // generic taxonomy.
      return ACTIVITY_KINDS.GENERIC;
    }
  }
  return ACTIVITY_KINDS.GENERIC;
}

function withinWindow(events, kind, windowMs, nowMs) {
  return events.filter((event) => event.kind === kind && nowMs - event.at <= windowMs);
}

export class SecurityMonitoringService {
  constructor(securityFlagRepository, sessionRepository) {
    this.securityFlagRepository = securityFlagRepository;
    this.sessionRepository = sessionRepository;
  }

  async createFlag({ session, ruleCode, kind, details }) {
    await this.securityFlagRepository.create({
      _id: crypto.randomUUID().replaceAll("-", ""),
      userId: session.userId,
      sessionId: session.id,
      kind,
      ruleCode,
      details,
      createdAt: new Date()
    });
  }

  async evaluateSessionUsage({ session, ipAddress, userAgent, method, path }) {
    const ipHistory = [...(session.ipHistory || [])];
    const userAgentHistory = [...(session.userAgentHistory || [])];
    const activityHistory = [...(session.activityHistory || [])];

    if (ipAddress) {
      ipHistory.push(ipAddress);
    }
    if (userAgent) {
      userAgentHistory.push(userAgent);
    }

    const now = Date.now();
    const requestKind = classifyRequest(method, path);

    activityHistory.push({ kind: requestKind, method, path, at: now });
    const trimmedActivityHistory = activityHistory.slice(-100);
    const trimmedIpHistory = ipHistory.slice(-10);
    const trimmedUserAgentHistory = userAgentHistory.slice(-10);
    const uniqueIps = new Set(trimmedIpHistory);
    const uniqueAgents = new Set(trimmedUserAgentHistory);

    await this.sessionRepository.update(session.id, {
      lastSeenAt: new Date(),
      ipHistory: trimmedIpHistory,
      userAgentHistory: trimmedUserAgentHistory,
      activityHistory: trimmedActivityHistory
    });

    if (uniqueIps.size > 3 || uniqueAgents.size > 3) {
      await this.createFlag({
        session,
        kind: "abnormal_access_pattern",
        ruleCode: "RULE_IP_UA_CHURN",
        details: {
          threshold: { uniqueIps: 3, uniqueUserAgents: 3 },
          observed: { uniqueIps: uniqueIps.size, uniqueUserAgents: uniqueAgents.size },
          ipHistory: trimmedIpHistory,
          userAgentHistory: trimmedUserAgentHistory
        }
      });
    }

    // Each rule is evaluated independently against its OWN activity
    // kind. Backup attempts and export attempts are scored separately
    // so a noisy backup operator never silently masks an exfiltration
    // pattern (or vice versa).
    let triggered = uniqueIps.size > 3 || uniqueAgents.size > 3;
    for (const rule of [
      RULES.RAPID_RECORD_LOOKUP,
      RULES.REPEATED_BACKUP_EXECUTION,
      RULES.REPEATED_EXPORT_ATTEMPT
    ]) {
      const events = withinWindow(trimmedActivityHistory, rule.kind, rule.windowMs, now);
      if (events.length >= rule.threshold) {
        triggered = true;
        await this.createFlag({
          session,
          kind: rule.flagKind,
          ruleCode: rule.code,
          details: {
            threshold: { count: rule.threshold, windowSeconds: rule.windowMs / 1000 },
            observed: { count: events.length },
            samplePaths: events.slice(-5).map((event) => event.path)
          }
        });
      }
    }

    return triggered;
  }

  async listFlagsForUser(userId) {
    return this.securityFlagRepository.listByUserId(userId);
  }

  async listFlagsAdmin({ userId, sessionId, ruleCode, from, to, limit } = {}) {
    const filters = {};
    if (userId && typeof userId === "string") {
      filters.userId = userId.trim();
    }
    if (sessionId && typeof sessionId === "string") {
      filters.sessionId = sessionId.trim();
    }
    if (ruleCode && typeof ruleCode === "string") {
      filters.ruleCode = ruleCode.trim();
    }
    if (from) {
      const parsed = new Date(from);
      if (!Number.isNaN(parsed.getTime())) {
        filters.from = parsed;
      }
    }
    if (to) {
      const parsed = new Date(to);
      if (!Number.isNaN(parsed.getTime())) {
        filters.to = parsed;
      }
    }
    if (limit !== undefined) {
      filters.limit = limit;
    }
    return this.securityFlagRepository.listFiltered(filters);
  }
}
