import crypto from "node:crypto";

const LOOKUP_WINDOW_MS = 60_000;
const LOOKUP_THRESHOLD = 8;
const BACKUP_WINDOW_MS = 10 * 60_000;
const BACKUP_THRESHOLD = 3;

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
    const requestKind =
      method === "GET" && [
        "/api/v1/mindtrack/clients",
        "/api/v1/mindtrack/self-context"
      ].some((prefix) => path.startsWith(prefix))
        ? "record_lookup"
        : method === "GET" && path.includes("/timeline")
          ? "record_lookup"
          : method === "POST" && path === "/api/v1/system/backup-run"
            ? "backup_attempt"
            : "generic";

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

    const rapidLookups = withinWindow(trimmedActivityHistory, "record_lookup", LOOKUP_WINDOW_MS, now);
    if (rapidLookups.length >= LOOKUP_THRESHOLD) {
      await this.createFlag({
        session,
        kind: "abnormal_lookup_volume",
        ruleCode: "RULE_RAPID_RECORD_LOOKUP",
        details: {
          threshold: { count: LOOKUP_THRESHOLD, windowSeconds: LOOKUP_WINDOW_MS / 1000 },
          observed: { count: rapidLookups.length },
          samplePaths: rapidLookups.slice(-5).map((event) => event.path)
        }
      });
    }

    const backupAttempts = withinWindow(trimmedActivityHistory, "backup_attempt", BACKUP_WINDOW_MS, now);
    if (backupAttempts.length >= BACKUP_THRESHOLD) {
      await this.createFlag({
        session,
        kind: "repeated_backup_attempts",
        ruleCode: "RULE_REPEATED_BACKUP_EXECUTION",
        details: {
          threshold: { count: BACKUP_THRESHOLD, windowSeconds: BACKUP_WINDOW_MS / 1000 },
          observed: { count: backupAttempts.length }
        }
      });
    }

    return uniqueIps.size > 3 || uniqueAgents.size > 3 || rapidLookups.length >= LOOKUP_THRESHOLD || backupAttempts.length >= BACKUP_THRESHOLD;
  }

  async listFlagsForUser(userId) {
    return this.securityFlagRepository.listByUserId(userId);
  }
}
