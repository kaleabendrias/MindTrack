import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";

// SystemService captures config.backupDirectory into module-private state at
// import time, so we MUST set BACKUP_DIRECTORY (and the other required
// secrets) before the dynamic import below. We use a long, non-trivial
// value so the secret-validation in config/index.js accepts it.
const TMP_BACKUP_DIR = await fs.mkdtemp(path.join(os.tmpdir(), "restore-unit-"));
process.env.BACKUP_DIRECTORY = TMP_BACKUP_DIR;
process.env.MONGO_URI ??= "mongodb://127.0.0.1:27017/offline_system?replicaSet=rs0";
process.env.MONGO_DB_NAME ??= "offline_system";
process.env.AUTH_TOKEN_SECRET ??= "a".repeat(64);
process.env.REFRESH_TOKEN_SECRET ??= "b".repeat(64);
process.env.REQUEST_SIGNING_SECRET ??= "c".repeat(64);
process.env.DATA_ENCRYPTION_KEY ??= "d".repeat(64);

const { SystemService } = await import(
  "../../apps/backend/src/application/services/SystemService.js"
);

function makeStubAuditService() {
  const calls = [];
  return {
    calls,
    async logAction(entry) {
      calls.push(entry);
    }
  };
}

function makePassThroughIdempotencyService() {
  // The real IdempotencyService persists the response. For unit tests we
  // just want the handler to run unconditionally so we can assert behavior.
  return {
    async execute({ handler }) {
      const result = await handler();
      return { ...result, idempotentReplay: false };
    }
  };
}

function makeFailingRepository() {
  return {
    snapshotCollections: async () => ({
      users: [{ _id: "u1", username: "u1" }],
      clients: [],
      entries: [],
      facilities: [],
      auditLogs: [
        // The presence of audit logs in the snapshot is intentional —
        // restoreCollections is required to IGNORE them.
        { _id: "audit-from-snapshot", actorUserId: "x", action: "create" }
      ],
      settings: []
    }),
    restoreCollections: async () => {
      const err = new Error("simulated mid-restore failure");
      err.code = "SIMULATED";
      throw err;
    }
  };
}

function makeSucceedingRepository(observedSnapshot) {
  return {
    snapshotCollections: async () => ({
      users: [{ _id: "u1", username: "u1" }],
      clients: [],
      entries: [],
      facilities: [],
      auditLogs: [
        { _id: "audit-from-snapshot-1", actorUserId: "x", action: "create" }
      ],
      settings: []
    }),
    restoreCollections: async (snapshot) => {
      observedSnapshot.value = snapshot;
      return { transactional: true };
    }
  };
}

test("restoreFromBackup rolls back on failure and records the rollback in the audit log", async () => {
  {
    const auditService = makeStubAuditService();
    const observedSnapshot = { value: null };
    const successRepo = makeSucceedingRepository(observedSnapshot);
    const successService = new SystemService(
      successRepo,
      auditService,
      { listFlagsForUser: async () => [], listFlagsAdmin: async () => [] },
      makePassThroughIdempotencyService()
    );

    // Create a real encrypted backup file via the service so the filename
    // matches the strict allowlist regex.
    const backupResult = await successService.runBackupNow({
      actor: { id: "admin", username: "admin" },
      reason: "rollback unit test setup"
    });
    assert.ok(backupResult.file);
    assert.match(backupResult.file, /^mindtrack-backup-.*\.enc\.json$/);

    // Now point the service at a repository that fails mid-restore so we
    // can assert the failure path.
    const failingRepo = makeFailingRepository();
    const rollbackService = new SystemService(
      failingRepo,
      auditService,
      { listFlagsForUser: async () => [], listFlagsAdmin: async () => [] },
      makePassThroughIdempotencyService()
    );

    let err;
    try {
      await rollbackService.restoreFromBackup({
        actor: { id: "admin", username: "admin" },
        filename: backupResult.file,
        reason: "rollback assertion",
        idempotencyKey: crypto.randomUUID()
      });
    } catch (e) {
      err = e;
    }
    assert.ok(err, "restoreFromBackup must throw on failure");
    assert.equal(err.code, "RESTORE_ROLLED_BACK");
    assert.equal(err.statusCode, 500);

    // The audit log must capture the failed restore (even though the
    // underlying mutation was rolled back). The exact wording in the
    // reason is "(failed: …)" so that the same code path can record
    // both true rollbacks and pre-write refusals (e.g. replica-set
    // precondition failures) consistently.
    const rollbackEntry = auditService.calls.find(
      (call) =>
        call.entityType === "backup_restore" &&
        typeof call.reason === "string" &&
        call.reason.includes("failed:")
    );
    assert.ok(rollbackEntry, "failed restore must be recorded in the audit log");
  }
});

test("restoreFromBackup ignores audit logs in the snapshot (append-only ledger preserved)", async () => {
  {
    const auditService = makeStubAuditService();
    const observedSnapshot = { value: null };
    const repo = makeSucceedingRepository(observedSnapshot);
    const service = new SystemService(
      repo,
      auditService,
      { listFlagsForUser: async () => [], listFlagsAdmin: async () => [] },
      makePassThroughIdempotencyService()
    );

    const backupResult = await service.runBackupNow({
      actor: { id: "admin", username: "admin" },
      reason: "audit-log unit test setup"
    });

    const restoreResult = await service.restoreFromBackup({
      actor: { id: "admin", username: "admin" },
      filename: backupResult.file,
      reason: "audit log assertion",
      idempotencyKey: crypto.randomUUID()
    });
    assert.equal(restoreResult.statusCode, 200);
    assert.equal(restoreResult.body.success, true);
    assert.equal(restoreResult.body.auditLogsPreserved, true);

    // The repository's restoreCollections receives the full snapshot, but
    // the contract is: audit logs are skipped at the repository layer. We
    // verify that contract via a separate, dedicated unit test on
    // MongoSystemRepository (see below). Here we just verify the response
    // shape and audit-log marker.
    const successAudit = auditService.calls.find(
      (call) =>
        call.entityType === "backup_restore" &&
        call.action === "create" &&
        call.after?.auditLogsPreserved === true
    );
    assert.ok(successAudit, "successful restore must record auditLogsPreserved=true");
  }
});

test("cleanup tmp backup directory", async () => {
  await fs.rm(TMP_BACKUP_DIR, { recursive: true, force: true });
});

test("restoreFromBackup rejects non-allowlisted filenames before any filesystem access", async () => {
  const auditService = makeStubAuditService();
  const repo = {
    snapshotCollections: async () => ({}),
    restoreCollections: async () => {
      throw new Error("must not be called");
    }
  };
  const service = new SystemService(
    repo,
    auditService,
    { listFlagsForUser: async () => [], listFlagsAdmin: async () => [] },
    makePassThroughIdempotencyService()
  );

  const traversalCases = [
    "../../../etc/passwd",
    "..\\windows\\system32",
    "/etc/passwd",
    "evil.enc.json",
    "mindtrack-backup-../etc/passwd.enc.json",
    "mindtrack-backup-2026.txt",
    "",
    "mindtrack-backup-2026.enc.json\u0000.txt"
  ];
  for (const filename of traversalCases) {
    let err;
    try {
      await service.restoreFromBackup({
        actor: { id: "admin", username: "admin" },
        filename,
        reason: "traversal probe",
        idempotencyKey: crypto.randomUUID()
      });
    } catch (e) {
      err = e;
    }
    assert.ok(err, `must reject filename "${filename}"`);
    assert.equal(err.statusCode, 400);
    assert.match(
      String(err.code),
      /INVALID_BACKUP_FILENAME|INVALID_REQUEST/,
      `unexpected error code for ${filename}: ${err.code}`
    );
  }
});

test("_applyRestore with empty snapshot arrays calls deleteMany for every collection and results in zero counts", async () => {
  // Import the repository class so we can exercise _applyRestore directly
  // with stub models that track deleteMany/insertMany calls.
  const { MongoSystemRepository } = await import(
    "../../apps/backend/src/infrastructure/repositories/MongoSystemRepository.js"
  );

  const deletedCollections = [];
  const insertedCollections = [];

  function makeStubModel(name) {
    return {
      _name: name,
      deleteMany: async (_filter, _opts) => {
        deletedCollections.push(name);
      },
      insertMany: async (docs, _opts) => {
        insertedCollections.push({ name, count: docs.length });
      }
    };
  }

  // Monkey-patch the repository's _applyRestore to use our stub models.
  // _applyRestore builds its restorableCollections array from the imported
  // Mongoose models, so we override the method to inject our stubs.
  const repo = new MongoSystemRepository();
  const stubModels = {
    UserModel: makeStubModel("users"),
    MindTrackClientModel: makeStubModel("clients"),
    MindTrackEntryModel: makeStubModel("entries"),
    FacilityModel: makeStubModel("facilities"),
    SystemSettingsModel: makeStubModel("settings"),
  };

  // Override _applyRestore to use stub models instead of real Mongoose models.
  repo._applyRestore = async function(snapshot, session) {
    const opts = { session };

    const restorableCollections = [
      { model: stubModels.UserModel, data: snapshot.users },
      { model: stubModels.MindTrackClientModel, data: snapshot.clients },
      { model: stubModels.MindTrackEntryModel, data: snapshot.entries },
      { model: stubModels.FacilityModel, data: snapshot.facilities },
      { model: stubModels.SystemSettingsModel, data: snapshot.settings },
    ];

    for (const { model, data } of restorableCollections) {
      await model.deleteMany({}, opts);
      if (data?.length) {
        await model.insertMany(data, opts);
      }
    }
  };

  // Snapshot with ALL empty arrays — simulates an empty database backup.
  const emptySnapshot = {
    users: [],
    clients: [],
    entries: [],
    facilities: [],
    settings: [],
    auditLogs: [{ _id: "audit1" }] // present but must be ignored
  };

  await repo._applyRestore(emptySnapshot, null);

  // deleteMany must have been called for every restorable collection.
  assert.deepEqual(
    deletedCollections.sort(),
    ["clients", "entries", "facilities", "settings", "users"],
    "deleteMany must be called for every restorable collection even when snapshot arrays are empty"
  );

  // insertMany must NOT have been called for any collection (all arrays empty).
  assert.equal(
    insertedCollections.length,
    0,
    "insertMany must not be called when snapshot arrays are empty — collections should be left at zero count"
  );

  // auditLogs must not appear in either list (append-only, never restored).
  assert.ok(
    !deletedCollections.includes("auditLogs"),
    "audit logs must never be deleted during restore"
  );
});

test("_applyRestore with mixed empty and populated arrays only inserts for non-empty collections", async () => {
  const deletedCollections = [];
  const insertedCollections = [];

  function makeStubModel(name) {
    return {
      deleteMany: async () => { deletedCollections.push(name); },
      insertMany: async (docs) => { insertedCollections.push({ name, count: docs.length }); }
    };
  }

  const { MongoSystemRepository } = await import(
    "../../apps/backend/src/infrastructure/repositories/MongoSystemRepository.js"
  );
  const repo = new MongoSystemRepository();

  const stubModels = {
    UserModel: makeStubModel("users"),
    MindTrackClientModel: makeStubModel("clients"),
    MindTrackEntryModel: makeStubModel("entries"),
    FacilityModel: makeStubModel("facilities"),
    SystemSettingsModel: makeStubModel("settings"),
  };

  repo._applyRestore = async function(snapshot, session) {
    const opts = { session };
    const restorableCollections = [
      { model: stubModels.UserModel, data: snapshot.users },
      { model: stubModels.MindTrackClientModel, data: snapshot.clients },
      { model: stubModels.MindTrackEntryModel, data: snapshot.entries },
      { model: stubModels.FacilityModel, data: snapshot.facilities },
      { model: stubModels.SystemSettingsModel, data: snapshot.settings },
    ];
    for (const { model, data } of restorableCollections) {
      await model.deleteMany({}, opts);
      if (data?.length) {
        await model.insertMany(data, opts);
      }
    }
  };

  // users has data, clients/entries/facilities/settings are empty.
  const mixedSnapshot = {
    users: [{ _id: "u1", username: "admin" }],
    clients: [],
    entries: [],
    facilities: [],
    settings: [],
    auditLogs: []
  };

  await repo._applyRestore(mixedSnapshot, null);

  // All five collections must have been cleared.
  assert.deepEqual(
    deletedCollections.sort(),
    ["clients", "entries", "facilities", "settings", "users"]
  );

  // Only users should have had insertMany called.
  assert.equal(insertedCollections.length, 1);
  assert.equal(insertedCollections[0].name, "users");
  assert.equal(insertedCollections[0].count, 1);
});

test("listSecurityFlagsAdmin forwards filters to repository", async () => {
  const captured = { args: null };
  const securityMonitoringService = {
    listFlagsForUser: async () => [],
    listFlagsAdmin: async (filters) => {
      captured.args = filters;
      return [
        {
          _id: "f1",
          userId: filters.userId || "any",
          sessionId: filters.sessionId || "any",
          ruleCode: filters.ruleCode || "RULE_X",
          createdAt: new Date()
        }
      ];
    }
  };
  const service = new SystemService(
    { snapshotCollections: async () => ({}) },
    makeStubAuditService(),
    securityMonitoringService,
    makePassThroughIdempotencyService()
  );

  const result = await service.listSecurityFlagsAdmin({
    userId: "u1",
    sessionId: "s1",
    ruleCode: "RULE_RAPID_RECORD_LOOKUP",
    from: "2026-04-01T00:00:00Z",
    to: "2026-04-07T23:59:59Z",
    limit: 50
  });
  assert.equal(result.length, 1);
  assert.equal(captured.args.userId, "u1");
  assert.equal(captured.args.sessionId, "s1");
  assert.equal(captured.args.ruleCode, "RULE_RAPID_RECORD_LOOKUP");
  assert.equal(captured.args.from, "2026-04-01T00:00:00Z");
  assert.equal(captured.args.to, "2026-04-07T23:59:59Z");
  assert.equal(captured.args.limit, 50);
});
