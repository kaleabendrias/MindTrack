import test from "node:test";
import assert from "node:assert/strict";
import { SecurityMonitoringService, ACTIVITY_KINDS } from "../../apps/backend/src/application/services/SecurityMonitoringService.js";

// ---------------------------------------------------------------------------
// Stubs
// ---------------------------------------------------------------------------

function makeSession(overrides = {}) {
  return {
    id: "sess-001",
    userId: "user-001",
    ipHistory: [],
    userAgentHistory: [],
    activityHistory: [],
    ...overrides
  };
}

function makeRepos() {
  const flags = [];
  const sessionUpdates = [];
  return {
    securityFlagRepository: {
      async create(flag) { flags.push(flag); },
      _flags: flags
    },
    sessionRepository: {
      async update(id, data) { sessionUpdates.push({ id, data }); },
      _updates: sessionUpdates
    }
  };
}

function makeSvc(repos) {
  return new SecurityMonitoringService(
    repos.securityFlagRepository,
    repos.sessionRepository
  );
}

// ---------------------------------------------------------------------------
// classifyRequest — exported indirectly via evaluateSessionUsage side-effects
// We verify classification by checking which flags get created.
// ---------------------------------------------------------------------------

test("classifyRequest — GET mindtrack/clients → record_lookup", async () => {
  const repos = makeRepos();
  const svc = makeSvc(repos);
  const session = makeSession();

  // Fill threshold of 8 record_lookups in a single evaluateSessionUsage call
  // by pre-loading activityHistory (simulate already at threshold-1 then push one more)
  const nowMs = Date.now();
  const history = Array.from({ length: 7 }, (_, i) => ({
    kind: ACTIVITY_KINDS.RECORD_LOOKUP,
    method: "GET",
    path: "/api/v1/mindtrack/clients",
    at: nowMs - i * 100
  }));
  const s = makeSession({ activityHistory: history });
  await svc.evaluateSessionUsage({ session: s, ipAddress: "10.0.0.1", userAgent: "ua1", method: "GET", path: "/api/v1/mindtrack/clients" });

  const ruleFired = repos.securityFlagRepository._flags.some((f) => f.ruleCode === "RULE_RAPID_RECORD_LOOKUP");
  assert.ok(ruleFired, "RULE_RAPID_RECORD_LOOKUP must fire when 8 record lookups occur within 60s");
});

test("classifyRequest — GET self-context → record_lookup", async () => {
  const repos = makeRepos();
  const svc = makeSvc(repos);
  const nowMs = Date.now();
  const history = Array.from({ length: 7 }, (_, i) => ({
    kind: ACTIVITY_KINDS.RECORD_LOOKUP,
    method: "GET",
    path: "/api/v1/mindtrack/self-context",
    at: nowMs - i * 100
  }));
  await svc.evaluateSessionUsage({ session: makeSession({ activityHistory: history }), ipAddress: "10.0.0.1", userAgent: "ua1", method: "GET", path: "/api/v1/mindtrack/self-context" });
  assert.ok(repos.securityFlagRepository._flags.some((f) => f.ruleCode === "RULE_RAPID_RECORD_LOOKUP"));
});

test("classifyRequest — GET timeline path → record_lookup", async () => {
  const repos = makeRepos();
  const svc = makeSvc(repos);
  const nowMs = Date.now();
  const history = Array.from({ length: 7 }, (_, i) => ({
    kind: ACTIVITY_KINDS.RECORD_LOOKUP,
    method: "GET",
    path: "/api/v1/mindtrack/clients/cli001/timeline",
    at: nowMs - i * 100
  }));
  await svc.evaluateSessionUsage({ session: makeSession({ activityHistory: history }), ipAddress: "10.0.0.1", userAgent: "ua1", method: "GET", path: "/api/v1/mindtrack/clients/cli001/timeline" });
  assert.ok(repos.securityFlagRepository._flags.some((f) => f.ruleCode === "RULE_RAPID_RECORD_LOOKUP"));
});

test("classifyRequest — GET attachments → export_attempt", async () => {
  const repos = makeRepos();
  const svc = makeSvc(repos);
  const nowMs = Date.now();
  const history = Array.from({ length: 2 }, (_, i) => ({
    kind: ACTIVITY_KINDS.EXPORT_ATTEMPT,
    method: "GET",
    path: "/api/v1/mindtrack/clients/cli001/attachments/abc123",
    at: nowMs - i * 100
  }));
  await svc.evaluateSessionUsage({ session: makeSession({ activityHistory: history }), ipAddress: "10.0.0.1", userAgent: "ua1", method: "GET", path: "/api/v1/mindtrack/clients/cli001/attachments/file.pdf" });
  assert.ok(repos.securityFlagRepository._flags.some((f) => f.ruleCode === "RULE_REPEATED_EXPORT_ATTEMPT"));
});

test("classifyRequest — GET search → export_attempt", async () => {
  const repos = makeRepos();
  const svc = makeSvc(repos);
  const nowMs = Date.now();
  const history = Array.from({ length: 2 }, (_, i) => ({
    kind: ACTIVITY_KINDS.EXPORT_ATTEMPT,
    method: "GET",
    path: "/api/v1/mindtrack/search",
    at: nowMs - i * 100
  }));
  await svc.evaluateSessionUsage({ session: makeSession({ activityHistory: history }), ipAddress: "10.0.0.1", userAgent: "ua1", method: "GET", path: "/api/v1/mindtrack/search" });
  assert.ok(repos.securityFlagRepository._flags.some((f) => f.ruleCode === "RULE_REPEATED_EXPORT_ATTEMPT"));
});

test("classifyRequest — GET backup-files → export_attempt", async () => {
  const repos = makeRepos();
  const svc = makeSvc(repos);
  const nowMs = Date.now();
  const history = Array.from({ length: 2 }, (_, i) => ({
    kind: ACTIVITY_KINDS.EXPORT_ATTEMPT,
    method: "GET",
    path: "/api/v1/system/backup-files",
    at: nowMs - i * 100
  }));
  await svc.evaluateSessionUsage({ session: makeSession({ activityHistory: history }), ipAddress: "10.0.0.1", userAgent: "ua1", method: "GET", path: "/api/v1/system/backup-files" });
  assert.ok(repos.securityFlagRepository._flags.some((f) => f.ruleCode === "RULE_REPEATED_EXPORT_ATTEMPT"));
});

test("classifyRequest — POST backup-run → backup_attempt", async () => {
  const repos = makeRepos();
  const svc = makeSvc(repos);
  const nowMs = Date.now();
  const history = Array.from({ length: 2 }, (_, i) => ({
    kind: ACTIVITY_KINDS.BACKUP_ATTEMPT,
    method: "POST",
    path: "/api/v1/system/backup-run",
    at: nowMs - i * 100
  }));
  await svc.evaluateSessionUsage({ session: makeSession({ activityHistory: history }), ipAddress: "10.0.0.1", userAgent: "ua1", method: "POST", path: "/api/v1/system/backup-run" });
  assert.ok(repos.securityFlagRepository._flags.some((f) => f.ruleCode === "RULE_REPEATED_BACKUP_EXECUTION"));
});

test("classifyRequest — POST backup-restore → generic (no rule fired)", async () => {
  const repos = makeRepos();
  const svc = makeSvc(repos);
  // Send 10 backup-restore requests — none of the rules cover generic
  for (let i = 0; i < 10; i += 1) {
    await svc.evaluateSessionUsage({ session: makeSession(), ipAddress: "10.0.0.1", userAgent: "ua1", method: "POST", path: "/api/v1/system/backup-restore" });
  }
  const ruled = repos.securityFlagRepository._flags.filter(
    (f) => ["RULE_RAPID_RECORD_LOOKUP", "RULE_REPEATED_BACKUP_EXECUTION", "RULE_REPEATED_EXPORT_ATTEMPT"].includes(f.ruleCode)
  );
  assert.equal(ruled.length, 0, "backup-restore must map to generic and not trigger any rule");
});

// ---------------------------------------------------------------------------
// evaluateSessionUsage — state transitions
// ---------------------------------------------------------------------------

test("evaluateSessionUsage updates session with lastSeenAt and trimmed histories", async () => {
  const repos = makeRepos();
  const svc = makeSvc(repos);
  await svc.evaluateSessionUsage({ session: makeSession(), ipAddress: "10.0.0.1", userAgent: "Mozilla", method: "GET", path: "/api/v1/healthz" });
  const update = repos.sessionRepository._updates[0];
  assert.ok(update, "sessionRepository.update must be called");
  assert.ok(update.data.lastSeenAt instanceof Date);
  assert.deepEqual(update.data.ipHistory, ["10.0.0.1"]);
  assert.deepEqual(update.data.userAgentHistory, ["Mozilla"]);
  assert.equal(update.data.activityHistory.length, 1);
});

test("evaluateSessionUsage trims activityHistory to last 100 entries", async () => {
  const repos = makeRepos();
  const svc = makeSvc(repos);
  const nowMs = Date.now();
  const history = Array.from({ length: 120 }, (_, i) => ({ kind: ACTIVITY_KINDS.GENERIC, method: "GET", path: "/x", at: nowMs - i }));
  await svc.evaluateSessionUsage({ session: makeSession({ activityHistory: history }), ipAddress: "1.1.1.1", userAgent: "ua", method: "GET", path: "/y" });
  const { activityHistory } = repos.sessionRepository._updates[0].data;
  assert.equal(activityHistory.length, 100);
});

test("evaluateSessionUsage trims ipHistory to last 10 entries", async () => {
  const repos = makeRepos();
  const svc = makeSvc(repos);
  const history = Array.from({ length: 15 }, (_, i) => `10.0.0.${i}`);
  await svc.evaluateSessionUsage({ session: makeSession({ ipHistory: history }), ipAddress: "10.0.0.99", userAgent: "ua", method: "GET", path: "/x" });
  assert.equal(repos.sessionRepository._updates[0].data.ipHistory.length, 10);
});

test("evaluateSessionUsage returns false when no rule fires", async () => {
  const repos = makeRepos();
  const svc = makeSvc(repos);
  const result = await svc.evaluateSessionUsage({ session: makeSession(), ipAddress: "1.2.3.4", userAgent: "browser", method: "GET", path: "/api/v1/healthz" });
  assert.equal(result, false);
});

test("evaluateSessionUsage returns true when a rule fires", async () => {
  const repos = makeRepos();
  const svc = makeSvc(repos);
  const nowMs = Date.now();
  const history = Array.from({ length: 7 }, (_, i) => ({
    kind: ACTIVITY_KINDS.RECORD_LOOKUP,
    method: "GET",
    path: "/api/v1/mindtrack/clients",
    at: nowMs - i * 100
  }));
  const result = await svc.evaluateSessionUsage({ session: makeSession({ activityHistory: history }), ipAddress: "1.2.3.4", userAgent: "ua", method: "GET", path: "/api/v1/mindtrack/clients" });
  assert.equal(result, true);
});

// ---------------------------------------------------------------------------
// IP / UA churn detection
// ---------------------------------------------------------------------------

test("4 unique IPs triggers RULE_IP_UA_CHURN flag", async () => {
  const repos = makeRepos();
  const svc = makeSvc(repos);
  const ipHistory = ["10.0.0.1", "10.0.0.2", "10.0.0.3", "10.0.0.4"];
  await svc.evaluateSessionUsage({ session: makeSession({ ipHistory }), ipAddress: "10.0.0.5", userAgent: "ua", method: "GET", path: "/x" });
  assert.ok(repos.securityFlagRepository._flags.some((f) => f.ruleCode === "RULE_IP_UA_CHURN"));
});

test("3 unique IPs does NOT trigger RULE_IP_UA_CHURN (boundary)", async () => {
  const repos = makeRepos();
  const svc = makeSvc(repos);
  const ipHistory = ["10.0.0.1", "10.0.0.1", "10.0.0.2", "10.0.0.3"];
  await svc.evaluateSessionUsage({ session: makeSession({ ipHistory }), ipAddress: "10.0.0.3", userAgent: "ua", method: "GET", path: "/x" });
  assert.ok(!repos.securityFlagRepository._flags.some((f) => f.ruleCode === "RULE_IP_UA_CHURN"));
});

test("4 unique user agents triggers RULE_IP_UA_CHURN flag", async () => {
  const repos = makeRepos();
  const svc = makeSvc(repos);
  const userAgentHistory = ["ua1", "ua2", "ua3", "ua4"];
  await svc.evaluateSessionUsage({ session: makeSession({ userAgentHistory }), ipAddress: "10.0.0.1", userAgent: "ua5", method: "GET", path: "/x" });
  assert.ok(repos.securityFlagRepository._flags.some((f) => f.ruleCode === "RULE_IP_UA_CHURN"));
});

test("RULE_IP_UA_CHURN flag records observed and threshold details", async () => {
  const repos = makeRepos();
  const svc = makeSvc(repos);
  const ipHistory = ["10.0.0.1", "10.0.0.2", "10.0.0.3", "10.0.0.4"];
  await svc.evaluateSessionUsage({ session: makeSession({ ipHistory }), ipAddress: "10.0.0.5", userAgent: "ua", method: "GET", path: "/x" });
  const flag = repos.securityFlagRepository._flags.find((f) => f.ruleCode === "RULE_IP_UA_CHURN");
  assert.equal(flag.details.threshold.uniqueIps, 3);
  assert.ok(flag.details.observed.uniqueIps >= 4);
});

// ---------------------------------------------------------------------------
// Rule threshold boundary
// ---------------------------------------------------------------------------

test("RULE_RAPID_RECORD_LOOKUP: exactly 7 events does NOT fire", async () => {
  const repos = makeRepos();
  const svc = makeSvc(repos);
  const nowMs = Date.now();
  const history = Array.from({ length: 6 }, (_, i) => ({
    kind: ACTIVITY_KINDS.RECORD_LOOKUP,
    method: "GET",
    path: "/api/v1/mindtrack/clients",
    at: nowMs - i * 100
  }));
  await svc.evaluateSessionUsage({ session: makeSession({ activityHistory: history }), ipAddress: "1.1.1.1", userAgent: "ua", method: "GET", path: "/api/v1/mindtrack/clients" });
  assert.ok(!repos.securityFlagRepository._flags.some((f) => f.ruleCode === "RULE_RAPID_RECORD_LOOKUP"));
});

test("RULE_RAPID_RECORD_LOOKUP: stale events outside 60s window do not count", async () => {
  const repos = makeRepos();
  const svc = makeSvc(repos);
  const nowMs = Date.now();
  // 7 events older than 60s window — should not count toward threshold
  const history = Array.from({ length: 7 }, (_, i) => ({
    kind: ACTIVITY_KINDS.RECORD_LOOKUP,
    method: "GET",
    path: "/api/v1/mindtrack/clients",
    at: nowMs - 120_000 - i * 100
  }));
  await svc.evaluateSessionUsage({ session: makeSession({ activityHistory: history }), ipAddress: "1.1.1.1", userAgent: "ua", method: "GET", path: "/api/v1/mindtrack/clients" });
  assert.ok(!repos.securityFlagRepository._flags.some((f) => f.ruleCode === "RULE_RAPID_RECORD_LOOKUP"));
});

test("RULE_REPEATED_BACKUP_EXECUTION fires at threshold 3", async () => {
  const repos = makeRepos();
  const svc = makeSvc(repos);
  const nowMs = Date.now();
  const history = Array.from({ length: 2 }, (_, i) => ({
    kind: ACTIVITY_KINDS.BACKUP_ATTEMPT,
    method: "POST",
    path: "/api/v1/system/backup-run",
    at: nowMs - i * 1000
  }));
  await svc.evaluateSessionUsage({ session: makeSession({ activityHistory: history }), ipAddress: "1.1.1.1", userAgent: "ua", method: "POST", path: "/api/v1/system/backup-run" });
  assert.ok(repos.securityFlagRepository._flags.some((f) => f.ruleCode === "RULE_REPEATED_BACKUP_EXECUTION"));
});

test("RULE_REPEATED_EXPORT_ATTEMPT fires at threshold 3", async () => {
  const repos = makeRepos();
  const svc = makeSvc(repos);
  const nowMs = Date.now();
  const history = Array.from({ length: 2 }, (_, i) => ({
    kind: ACTIVITY_KINDS.EXPORT_ATTEMPT,
    method: "GET",
    path: "/api/v1/mindtrack/search",
    at: nowMs - i * 1000
  }));
  await svc.evaluateSessionUsage({ session: makeSession({ activityHistory: history }), ipAddress: "1.1.1.1", userAgent: "ua", method: "GET", path: "/api/v1/mindtrack/search" });
  assert.ok(repos.securityFlagRepository._flags.some((f) => f.ruleCode === "RULE_REPEATED_EXPORT_ATTEMPT"));
});

test("backup and export rules are evaluated independently — backup does not count toward export rule", async () => {
  const repos = makeRepos();
  const svc = makeSvc(repos);
  const nowMs = Date.now();
  // 2 backup_attempt events in history + 1 new backup_attempt — should fire backup rule only
  const history = Array.from({ length: 2 }, (_, i) => ({
    kind: ACTIVITY_KINDS.BACKUP_ATTEMPT,
    method: "POST",
    path: "/api/v1/system/backup-run",
    at: nowMs - i * 1000
  }));
  await svc.evaluateSessionUsage({ session: makeSession({ activityHistory: history }), ipAddress: "1.1.1.1", userAgent: "ua", method: "POST", path: "/api/v1/system/backup-run" });
  assert.ok(repos.securityFlagRepository._flags.some((f) => f.ruleCode === "RULE_REPEATED_BACKUP_EXECUTION"));
  assert.ok(!repos.securityFlagRepository._flags.some((f) => f.ruleCode === "RULE_REPEATED_EXPORT_ATTEMPT"));
});

// ---------------------------------------------------------------------------
// createFlag
// ---------------------------------------------------------------------------

test("createFlag records userId, sessionId, ruleCode, and kind", async () => {
  const repos = makeRepos();
  const svc = makeSvc(repos);
  const session = makeSession({ id: "sess-xyz", userId: "user-abc" });
  await svc.createFlag({ session, ruleCode: "RULE_TEST", kind: "test_kind", details: { x: 1 } });
  const flag = repos.securityFlagRepository._flags[0];
  assert.equal(flag.userId, "user-abc");
  assert.equal(flag.sessionId, "sess-xyz");
  assert.equal(flag.ruleCode, "RULE_TEST");
  assert.equal(flag.kind, "test_kind");
  assert.ok(flag.createdAt instanceof Date);
});
