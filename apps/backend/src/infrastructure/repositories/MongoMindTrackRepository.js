import { MindTrackClientModel } from "../persistence/models/MindTrackClientModel.js";
import { MindTrackEntryModel } from "../persistence/models/MindTrackEntryModel.js";
import { MindTrackTemplateModel } from "../persistence/models/MindTrackTemplateModel.js";
import { FacilityModel } from "../persistence/models/FacilityModel.js";
import { SearchEventModel } from "../persistence/models/SearchEventModel.js";
import { decryptValue, encryptValue } from "../security/fieldCrypto.js";

function mapClient(doc) {
  if (!doc) {
    return null;
  }

  return {
    ...doc,
    phone: doc.encryptedPhone ? decryptValue(doc.encryptedPhone) : doc.phone || "",
    address: doc.encryptedAddress ? decryptValue(doc.encryptedAddress) : doc.address || ""
  };
}

export class MongoMindTrackRepository {
  async listClients(filter = {}) {
    const docs = await MindTrackClientModel.find({ mergedIntoClientId: null, ...filter })
      .sort({ createdAt: -1 })
      .lean();
    return docs.map(mapClient);
  }

  async findClientById(id) {
    const doc = await MindTrackClientModel.findById(id).lean();
    return mapClient(doc);
  }

  async createClient(payload) {
    const created = await MindTrackClientModel.create({
      ...payload,
      encryptedPhone: encryptValue(payload.phone),
      encryptedAddress: encryptValue(payload.address),
      phone: undefined,
      address: undefined
    });
    return mapClient(created.toObject());
  }

  async updateClient(id, payload) {
    const updateDoc = { ...payload };
    if (Object.prototype.hasOwnProperty.call(payload, "phone")) {
      updateDoc.encryptedPhone = encryptValue(payload.phone);
      delete updateDoc.phone;
    }
    if (Object.prototype.hasOwnProperty.call(payload, "address")) {
      updateDoc.encryptedAddress = encryptValue(payload.address);
      delete updateDoc.address;
    }
    const updated = await MindTrackClientModel.findByIdAndUpdate(id, updateDoc, { new: true }).lean();
    return mapClient(updated);
  }

  async findPotentialDuplicateClients({ name, dob }) {
    return MindTrackClientModel.find({
      mergedIntoClientId: null,
      $or: [{ name: new RegExp(name, "i") }, { dob: new Date(dob) }]
    })
      .sort({ updatedAt: -1 })
      .limit(20)
      .lean()
      .then((docs) => docs.map(mapClient));
  }

  async mergeClient({ primaryClientId, duplicateClientId, mergedAt }) {
    const merged = await MindTrackClientModel.findByIdAndUpdate(
      duplicateClientId,
      { mergedIntoClientId: primaryClientId, mergedAt, updatedAt: mergedAt },
      { new: true }
    ).lean();
    return mapClient(merged);
  }

  async mergeClientTransactional({ primaryClientId, duplicateClientId, mergedAt, session, failAfterEntryMove = false }) {
    await MindTrackEntryModel.updateMany(
      { clientId: duplicateClientId },
      { clientId: primaryClientId, updatedAt: mergedAt },
      { session }
    );

    if (failAfterEntryMove) {
      throw new Error("forced merge failure after entry reassignment");
    }

    const merged = await MindTrackClientModel.findByIdAndUpdate(
      duplicateClientId,
      { mergedIntoClientId: primaryClientId, mergedAt, updatedAt: mergedAt },
      { new: true, session }
    ).lean();

    return mapClient(merged);
  }

  async listTimeline(filter) {
    return MindTrackEntryModel.find({ deletedAt: null, ...filter })
      .sort({ occurredAt: -1, updatedAt: -1 })
      .lean();
  }

  async findEntryById(id) {
    return MindTrackEntryModel.findById(id).lean();
  }

  async createEntry(payload) {
    const created = await MindTrackEntryModel.create(payload);
    return created.toObject();
  }

  async updateEntry(id, payload) {
    return MindTrackEntryModel.findByIdAndUpdate(id, payload, { new: true }).lean();
  }

  async updateEntryWithVersion(id, expectedVersion, payload) {
    return MindTrackEntryModel.findOneAndUpdate(
      { _id: id, version: expectedVersion },
      { ...payload, version: expectedVersion + 1 },
      { new: true }
    ).lean();
  }

  async searchEntries(criteria) {
    const query = { deletedAt: null, ...(criteria.accessFilter || {}) };

    if (criteria.queryRegex) {
      query.$or = [
        { title: criteria.queryRegex },
        { body: criteria.queryRegex },
        { tags: criteria.queryRegex }
      ];
    }

    if (criteria.entryType) {
      query.entryType = criteria.entryType;
    }

    if (criteria.tags?.length) {
      query.tags = { $in: criteria.tags };
    }

    if (criteria.from || criteria.to) {
      query.occurredAt = {};
      if (criteria.from) {
        query.occurredAt.$gte = criteria.from;
      }
      if (criteria.to) {
        query.occurredAt.$lte = criteria.to;
      }
    }

    return MindTrackEntryModel.find(query).limit(300).lean();
  }

  async searchTemplates(criteria) {
    const query = {};

    if (criteria.queryRegex) {
      query.$or = [
        { title: criteria.queryRegex },
        { body: criteria.queryRegex },
        { tags: criteria.queryRegex }
      ];
    }

    if (criteria.entryType) {
      query.entryType = criteria.entryType;
    }

    if (criteria.tags?.length) {
      query.tags = { $in: criteria.tags };
    }

    return MindTrackTemplateModel.find(query).limit(100).lean();
  }

  async upsertTemplates(templates) {
    if (!templates.length) {
      return;
    }

    const ops = templates.map((template) => ({
      replaceOne: {
        filter: { _id: template._id },
        replacement: template,
        upsert: true
      }
    }));
    await MindTrackTemplateModel.bulkWrite(ops, { ordered: true });
  }

  async logSearchEvent(payload) {
    await SearchEventModel.create(payload);
  }

  async listSearchEventsSince(sinceDate, filter = {}) {
    return SearchEventModel.find({ createdAt: { $gte: sinceDate }, ...filter }).lean();
  }

  async listFacilities(filter = {}) {
    return FacilityModel.find(filter).lean();
  }

  async upsertFacilities(facilities) {
    if (!facilities.length) {
      return;
    }

    const ops = facilities.map((facility) => ({
      replaceOne: {
        filter: { _id: facility._id },
        replacement: facility,
        upsert: true
      }
    }));
    await FacilityModel.bulkWrite(ops, { ordered: true });
  }
}
