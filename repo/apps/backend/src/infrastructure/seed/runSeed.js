import { connectMongo, disconnectMongo } from "../database/mongooseConnection.js";
import { FacilityModel } from "../persistence/models/FacilityModel.js";
import { MindTrackClientModel } from "../persistence/models/MindTrackClientModel.js";
import { MindTrackEntryModel } from "../persistence/models/MindTrackEntryModel.js";
import { MindTrackTemplateModel } from "../persistence/models/MindTrackTemplateModel.js";
import { SystemSettingsModel } from "../persistence/models/SystemSettingsModel.js";
import { UserModel } from "../persistence/models/UserModel.js";
import { encryptValue } from "../security/fieldCrypto.js";
import { hashSecret } from "../security/passwordHasher.js";
import {
  seedFacilities,
  seedMindTrackClients,
  seedMindTrackEntries,
  seedMindTrackTemplates,
  seedUsers
} from "./seedData.js";

async function runSeed() {
  await connectMongo();

  const now = new Date();
  for (const user of seedUsers) {
    const securityQuestions = [];
    for (const item of user.securityQuestions) {
      securityQuestions.push({
        question: item.question,
        answerHash: await hashSecret(item.answer.trim().toLowerCase())
      });
    }

    await UserModel.findByIdAndUpdate(
      user.id,
      {
        _id: user.id,
        username: user.username,
        role: user.role,
        mindTrackClientId: user.mindTrackClientId || null,
        permissions: user.permissions,
        passwordHash: await hashSecret(user.password),
        securityQuestions,
        encryptedPhone: encryptValue(user.phone),
        encryptedAddress: encryptValue(user.address),
        failedLoginAttempts: 0,
        lockedUntil: null,
        createdAt: now,
        updatedAt: now
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }

  const facilityOps = seedFacilities.map((facility) => ({
    replaceOne: {
      filter: { _id: facility._id },
      replacement: {
        ...facility,
        createdAt: now,
        updatedAt: now
      },
      upsert: true
    }
  }));
  await FacilityModel.bulkWrite(facilityOps, { ordered: true });

  const clientOps = seedMindTrackClients.map((client) => ({
    replaceOne: {
      filter: { _id: client._id },
      replacement: {
        _id: client._id,
        name: client.name,
        dob: new Date(client.dob),
        encryptedPhone: encryptValue(client.phone),
        phoneLast4: client.phoneLast4,
        encryptedAddress: encryptValue(client.address),
        tags: client.tags,
        channel: client.channel,
        coordinate: client.coordinate,
        primaryClinicianId: client.primaryClinicianId,
        legalHold: false,
        retentionUntil: new Date("2033-01-01T00:00:00.000Z"),
        mergedIntoClientId: client.mergedIntoClientId,
        mergedAt: client.mergedAt,
        createdBy: client.createdBy,
        createdAt: now,
        updatedAt: now
      },
      upsert: true
    }
  }));
  await MindTrackClientModel.bulkWrite(clientOps, { ordered: true });

  const entryOps = seedMindTrackEntries.map((entry) => ({
    replaceOne: {
      filter: { _id: entry._id },
      replacement: {
        ...entry,
        occurredAt: new Date(entry.occurredAt),
        legalHold: false,
        retentionUntil: new Date("2033-01-01T00:00:00.000Z"),
        createdAt: now,
        updatedAt: now
      },
      upsert: true
    }
  }));
  await MindTrackEntryModel.bulkWrite(entryOps, { ordered: true });

  const templateOps = seedMindTrackTemplates.map((template) => ({
    replaceOne: {
      filter: { _id: template._id },
      replacement: {
        ...template,
        createdAt: now,
        updatedAt: now
      },
      upsert: true
    }
  }));
  await MindTrackTemplateModel.bulkWrite(templateOps, { ordered: true });

  await SystemSettingsModel.findByIdAndUpdate(
    "global",
    {
      _id: "global",
      profileFields: {
        phone: true,
        address: true,
        tags: true,
        piiPolicyVisible: true
      },
      createdAt: now,
      updatedAt: now
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  console.log(
    `Seed complete. Users: ${seedUsers.length}. MindTrack clients: ${seedMindTrackClients.length}.`
  );
}

runSeed()
  .catch((error) => {
    console.error("Seed failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectMongo();
  });
