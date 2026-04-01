import test from "node:test";
import assert from "node:assert/strict";
import { connectMongo, disconnectMongo, startMongoSession } from "../../apps/backend/src/infrastructure/database/mongooseConnection.js";
import { MindTrackClientModel } from "../../apps/backend/src/infrastructure/persistence/models/MindTrackClientModel.js";
import { MindTrackEntryModel } from "../../apps/backend/src/infrastructure/persistence/models/MindTrackEntryModel.js";
import { MongoMindTrackRepository } from "../../apps/backend/src/infrastructure/repositories/MongoMindTrackRepository.js";
import { encryptValue } from "../../apps/backend/src/infrastructure/security/fieldCrypto.js";

test("merge transaction rolls back without partial writes on failure", async () => {
  await connectMongo();
  const repo = new MongoMindTrackRepository();
  const now = new Date();

  await MindTrackEntryModel.deleteMany({ clientId: { $in: ["ut_primary", "ut_duplicate"] } });
  await MindTrackClientModel.deleteMany({ _id: { $in: ["ut_primary", "ut_duplicate"] } });

  await MindTrackClientModel.create([
    {
      _id: "ut_primary",
      name: "Primary",
      dob: now,
      encryptedPhone: encryptValue("+1-212-555-0001"),
      phoneLast4: "0001",
      encryptedAddress: encryptValue("1 Main St"),
      tags: [],
      channel: "in_person",
      coordinate: null,
      primaryClinicianId: "clinician-1",
      legalHold: false,
      retentionUntil: new Date("2033-01-01T00:00:00.000Z"),
      mergedIntoClientId: null,
      mergedAt: null,
      createdBy: "clinician-1",
      createdAt: now,
      updatedAt: now
    },
    {
      _id: "ut_duplicate",
      name: "Duplicate",
      dob: now,
      encryptedPhone: encryptValue("+1-212-555-0002"),
      phoneLast4: "0002",
      encryptedAddress: encryptValue("2 Main St"),
      tags: [],
      channel: "in_person",
      coordinate: null,
      primaryClinicianId: "clinician-1",
      legalHold: false,
      retentionUntil: new Date("2033-01-01T00:00:00.000Z"),
      mergedIntoClientId: null,
      mergedAt: null,
      createdBy: "clinician-1",
      createdAt: now,
      updatedAt: now
    }
  ]);

  await MindTrackEntryModel.create({
    _id: "ut_entry_1",
    clientId: "ut_duplicate",
    clinicianId: "clinician-1",
    entryType: "assessment",
    title: "Rollback test",
    body: "Body",
    tags: [],
    channel: "in_person",
    status: "draft",
    occurredAt: now,
    attachments: [],
    amendedFromEntryId: null,
    deletedAt: null,
    deletedReason: null,
    legalHold: false,
    retentionUntil: new Date("2033-01-01T00:00:00.000Z"),
    version: 1,
    createdAt: now,
    updatedAt: now
  });

  const session = await startMongoSession();
  await assert.rejects(async () => {
    await session.withTransaction(async () => {
      await repo.mergeClientTransactional({
        primaryClientId: "ut_primary",
        duplicateClientId: "ut_duplicate",
        mergedAt: new Date(),
        session,
        failAfterEntryMove: true
      });
    });
  });
  await session.endSession();

  const entry = await MindTrackEntryModel.findById("ut_entry_1").lean();
  const duplicate = await MindTrackClientModel.findById("ut_duplicate").lean();

  assert.equal(entry.clientId, "ut_duplicate");
  assert.equal(duplicate.mergedIntoClientId, null);

  await MindTrackEntryModel.deleteMany({ clientId: { $in: ["ut_primary", "ut_duplicate"] } });
  await MindTrackClientModel.deleteMany({ _id: { $in: ["ut_primary", "ut_duplicate"] } });
  await disconnectMongo();
});
