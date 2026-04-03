import crypto from "node:crypto";
import { AppError } from "../../domain/errors/AppError.js";
import { permissions } from "../../domain/models/User.js";
import { startMongoSession } from "../../infrastructure/database/mongooseConnection.js";
import { centroidFromZip, haversineMiles, parseUsAddress } from "../geo/geoUtils.js";
import { RetentionService } from "./RetentionService.js";
import { phoneLast4, scoreDuplicate } from "./mindTrackScoring.js";

function normalizeTags(tags) {
  return Array.from(
    new Set((Array.isArray(tags) ? tags : []).map((tag) => String(tag).trim().toLowerCase()))
  ).filter(Boolean);
}

function tokenize(value) {
  return String(value || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1);
}

function maskPhone(value) {
  if (!value) {
    return "";
  }
  return `${"*".repeat(Math.max(value.length - 4, 0))}${value.slice(-4)}`;
}

function sanitizeAddress(value) {
  return value ? "***masked***" : "";
}

function retentionDate(fromDate = new Date()) {
  const next = new Date(fromDate);
  next.setFullYear(next.getFullYear() + 7);
  return next;
}

function validateAttachments(attachments) {
  if (!Array.isArray(attachments)) {
    throw new AppError("attachments must be an array", 400, "INVALID_REQUEST");
  }

  if (attachments.length > 20) {
    throw new AppError("max 20 attachments per entry", 400, "INVALID_REQUEST");
  }

  const seen = new Set();
  for (const item of attachments) {
    if (!item || typeof item !== "object") {
      throw new AppError("invalid attachment payload", 400, "INVALID_REQUEST");
    }
    if (!["application/pdf", "image/jpeg", "image/png"].includes(item.type)) {
      throw new AppError("attachments must be PDF/JPG/PNG", 400, "INVALID_REQUEST");
    }
    if (Number(item.sizeBytes) > 10 * 1024 * 1024) {
      throw new AppError("attachment exceeds 10 MB", 400, "INVALID_REQUEST");
    }
    if (!item.fingerprint || seen.has(item.fingerprint)) {
      throw new AppError("duplicate attachment fingerprint", 400, "DUPLICATE_ATTACHMENT");
    }
    seen.add(item.fingerprint);
  }
}

export class MindTrackService {
  constructor({ mindTrackRepository, auditService, idempotencyService, userRepository, attachmentStorageService }) {
    this.mindTrackRepository = mindTrackRepository;
    this.auditService = auditService;
    this.idempotencyService = idempotencyService;
    this.userRepository = userRepository;
    this.attachmentStorageService = attachmentStorageService;
  }

  canViewPii(actor) {
    return actor.permissions.includes(permissions.piiView);
  }

  sanitizeClient(client, actor) {
    return {
      ...client,
      phone: this.canViewPii(actor) ? client.phone : maskPhone(client.phone),
      address: this.canViewPii(actor) ? client.address : sanitizeAddress(client.address)
    };
  }

  assertMutationAllowed(record, entityType) {
    const decision = RetentionService.canModifyRecord(record);
    if (!decision.allowed) {
      throw new AppError(
        `${entityType} is blocked by ${decision.reason}`,
        409,
        "RETENTION_BLOCKED"
      );
    }
  }

  async resolveClientAccess(actor, clientId) {
    const client = await this.mindTrackRepository.findClientById(clientId);
    if (!client || client.mergedIntoClientId) {
      throw new AppError("client not found", 404, "CLIENT_NOT_FOUND");
    }

    if (actor.role === "administrator") {
      return client;
    }

    if (actor.role === "clinician" && client.primaryClinicianId === actor.id) {
      return client;
    }

    if (actor.role === "client" && actor.mindTrackClientId === client._id) {
      return client;
    }

    throw new AppError("forbidden client context", 403, "FORBIDDEN");
  }

  async resolveEntryAccess(actor, entryId) {
    const entry = await this.mindTrackRepository.findEntryById(entryId);
    if (!entry) {
      throw new AppError("entry not found", 404, "ENTRY_NOT_FOUND");
    }
    const client = await this.resolveClientAccess(actor, entry.clientId);
    return { entry, client };
  }

  async accessibleClientFilter(actor) {
    if (actor.role === "administrator") {
      return {};
    }
    if (actor.role === "clinician") {
      return { primaryClinicianId: actor.id };
    }
    if (actor.role === "client") {
      return { _id: actor.mindTrackClientId };
    }
    throw new AppError("unsupported role", 403, "FORBIDDEN");
  }

  async listClients(actor) {
    const filter = await this.accessibleClientFilter(actor);
    const clients = await this.mindTrackRepository.listClients(filter);
    return clients.map((client) => this.sanitizeClient(client, actor));
  }

  async createClient({ actor, payload }) {
    if (!["administrator", "clinician"].includes(actor.role)) {
      throw new AppError("insufficient permissions", 403, "FORBIDDEN");
    }
    if (!payload.name || !payload.dob || !payload.phone || !payload.address) {
      throw new AppError("name, dob, phone and address are required", 400, "INVALID_REQUEST");
    }

    const candidates = await this.mindTrackRepository.findPotentialDuplicateClients({
      name: payload.name,
      dob: payload.dob
    });

    const duplicates = candidates
      .map((candidate) => ({ candidate, score: scoreDuplicate(candidate, payload) }))
      .filter((item) => item.score >= 0.7)
      .sort((a, b) => b.score - a.score)
      .map((item) => ({
        id: item.candidate._id,
        name: item.candidate.name,
        dob: item.candidate.dob,
        phoneLast4: item.candidate.phoneLast4,
        score: Number(item.score.toFixed(2))
      }));

    if (duplicates.length && actor.role !== "administrator") {
      throw new AppError("potential duplicate clients found", 409, "DUPLICATE_CLIENT", duplicates);
    }

    const parsedAddress = parseUsAddress(payload.address);
    const centroid = centroidFromZip(parsedAddress.zip);
    const now = new Date();
    let primaryClinicianId = actor.id;

    if (actor.role === "administrator") {
      if (!payload.primaryClinicianId) {
        throw new AppError("primaryClinicianId is required for administrator-created clients", 400, "PRIMARY_CLINICIAN_REQUIRED");
      }
      const assigned = await this.userRepository.findById(payload.primaryClinicianId);
      if (!assigned || assigned.role !== "clinician") {
        throw new AppError("primaryClinicianId must reference a valid clinician", 400, "INVALID_PRIMARY_CLINICIAN");
      }
      primaryClinicianId = assigned.id;
    } else if (payload.primaryClinicianId && payload.primaryClinicianId !== actor.id) {
      throw new AppError("clinician-created clients must remain assigned to the acting clinician", 400, "INVALID_PRIMARY_CLINICIAN");
    }

    const created = await this.mindTrackRepository.createClient({
      _id: crypto.randomUUID().replaceAll("-", ""),
      name: payload.name.trim(),
      dob: new Date(payload.dob),
      phone: payload.phone.trim(),
      phoneLast4: phoneLast4(payload.phone),
      address: payload.address.trim(),
      tags: normalizeTags(payload.tags),
      channel: payload.channel || "in_person",
      coordinate: centroid ? { lat: centroid.lat, lon: centroid.lon, source: "zip_centroid" } : null,
      primaryClinicianId,
      customFields: payload.customFields || {},
      legalHold: false,
      retentionUntil: retentionDate(now),
      mergedIntoClientId: null,
      mergedAt: null,
      createdBy: actor.id,
      createdAt: now,
      updatedAt: now
    });

    await this.auditService.logAction({
      actorUserId: actor.id,
      action: "create",
      entityType: "mindtrack_client",
      entityId: created._id,
      reason: payload.reason || "mindtrack client create",
      before: null,
      after: { ...created, phone: "***", address: "***" }
    });

    return {
      client: this.sanitizeClient(created, actor),
      duplicateCandidates: duplicates
    };
  }

  async updateClient({ actor, clientId, payload }) {
    if (!["administrator", "clinician"].includes(actor.role)) {
      throw new AppError("insufficient permissions", 403, "FORBIDDEN");
    }

    const client = await this.resolveClientAccess(actor, clientId);
    this.assertMutationAllowed(client, "client");

    const updates = { updatedAt: new Date() };
    if (payload.phone !== undefined) {
      updates.phone = payload.phone.trim();
      updates.phoneLast4 = phoneLast4(payload.phone);
    }
    if (payload.address !== undefined) {
      updates.address = payload.address.trim();
      const parsed = parseUsAddress(payload.address);
      const centroid = centroidFromZip(parsed.zip);
      if (centroid) {
        updates.coordinate = { lat: centroid.lat, lon: centroid.lon, source: "zip_centroid" };
      }
    }
    if (payload.tags !== undefined) {
      updates.tags = normalizeTags(payload.tags);
    }
    if (payload.channel !== undefined) {
      updates.channel = payload.channel;
    }
    if (payload.customFields !== undefined) {
      updates.customFields = { ...(client.customFields || {}), ...payload.customFields };
    }

    const updated = await this.mindTrackRepository.updateClient(client._id, updates);

    await this.auditService.logAction({
      actorUserId: actor.id,
      action: "update",
      entityType: "mindtrack_client",
      entityId: client._id,
      reason: payload.reason || "client profile update",
      before: { ...client, phone: "***", address: "***" },
      after: { ...updated, phone: "***", address: "***" }
    });

    return this.sanitizeClient(updated, actor);
  }

  async mergeClients({ actor, payload }) {
    if (actor.role !== "administrator") {
      throw new AppError("administrator role required for merge", 403, "FORBIDDEN");
    }
    if (!payload.primaryClientId || !payload.duplicateClientId || !payload.reason) {
      throw new AppError("primaryClientId, duplicateClientId and reason are required", 400, "INVALID_REQUEST");
    }

    return this.idempotencyService.execute({
      key: payload.idempotencyKey,
      userId: actor.id,
      action: `merge:${payload.primaryClientId}:${payload.duplicateClientId}`,
      handler: async () => {
        const primary = await this.resolveClientAccess(actor, payload.primaryClientId);
        const duplicate = await this.resolveClientAccess(actor, payload.duplicateClientId);
        this.assertMutationAllowed(primary, "client");
        this.assertMutationAllowed(duplicate, "client");

        if (primary._id === duplicate._id) {
          throw new AppError("primary and duplicate client must be different", 400, "INVALID_REQUEST");
        }

        const session = await startMongoSession();
        let merged;
        try {
          await session.withTransaction(async () => {
            merged = await this.mindTrackRepository.mergeClientTransactional({
              primaryClientId: primary._id,
              duplicateClientId: duplicate._id,
              mergedAt: new Date(),
              session,
              failAfterEntryMove: Boolean(payload.forceFailureAfterEntryMove)
            });
          });
        } finally {
          await session.endSession();
        }

        await this.auditService.logAction({
          actorUserId: actor.id,
          action: "update",
          entityType: "mindtrack_client_merge",
          entityId: duplicate._id,
          reason: payload.reason,
          before: { ...duplicate, phone: "***", address: "***" },
          after: { ...merged, phone: "***", address: "***" }
        });

        return {
          statusCode: 200,
          body: { primaryClientId: primary._id, mergedClientId: duplicate._id }
        };
      }
    });
  }

  async createEntry({ actor, payload }) {
    const client = await this.resolveClientAccess(actor, payload.clientId);
    this.assertMutationAllowed(client, "client");
    validateAttachments(payload.attachments || []);

    if (!payload.clientId || !payload.entryType || !payload.title || !payload.body) {
      throw new AppError("clientId, entryType, title and body are required", 400, "INVALID_REQUEST");
    }

    if (actor.role === "client") {
      if (payload.clientId !== actor.mindTrackClientId || payload.entryType !== "assessment") {
        throw new AppError("client may only create self assessments", 403, "FORBIDDEN");
      }
    } else if (!["clinician", "administrator"].includes(actor.role)) {
      throw new AppError("insufficient permissions", 403, "FORBIDDEN");
    }

    const now = new Date();
    const entryId = crypto.randomUUID().replaceAll("-", "");

    let storedAttachments = [];
    if (this.attachmentStorageService && (payload.attachments || []).length) {
      storedAttachments = await this.attachmentStorageService.store(entryId, payload.attachments);
    } else {
      storedAttachments = (payload.attachments || []).map((a) => ({
        name: a.name,
        type: a.type,
        sizeBytes: a.sizeBytes,
        fingerprint: a.fingerprint,
        storagePath: null
      }));
    }

    const created = await this.mindTrackRepository.createEntry({
      _id: entryId,
      clientId: payload.clientId,
      clinicianId: actor.role === "client" ? client.primaryClinicianId : actor.id,
      entryType: payload.entryType,
      title: payload.title.trim(),
      body: payload.body.trim(),
      tags: normalizeTags(payload.tags),
      channel: actor.role === "client" ? "self_service" : payload.channel || "in_person",
      status: actor.role === "client" ? "signed" : payload.status || "draft",
      occurredAt: payload.occurredAt ? new Date(payload.occurredAt) : now,
      attachments: storedAttachments,
      amendedFromEntryId: null,
      deletedAt: null,
      deletedReason: null,
      legalHold: false,
      retentionUntil: retentionDate(now),
      version: 1,
      createdAt: now,
      updatedAt: now
    });

    await this.auditService.logAction({
      actorUserId: actor.id,
      action: "create",
      entityType: "mindtrack_entry",
      entityId: created._id,
      reason: payload.reason || "entry create",
      before: null,
      after: created
    });

    return created;
  }

  async listTimeline({ actor, clientId }) {
    const client = await this.resolveClientAccess(actor, clientId);
    const includeDeleted = ["clinician", "administrator"].includes(actor.role);
    const entries = await this.mindTrackRepository.listTimeline({ clientId: client._id }, { includeDeleted });
    if (actor.role === "client") {
      return entries.filter(
        (entry) => entry.entryType === "assessment" || entry.entryType === "follow_up"
      );
    }
    return entries;
  }

  async signEntry({ actor, entryId, expectedVersion, idempotencyKey, reason }) {
    if (!["clinician", "administrator"].includes(actor.role)) {
      throw new AppError("insufficient permissions", 403, "FORBIDDEN");
    }

    return this.idempotencyService.execute({
      key: idempotencyKey,
      userId: actor.id,
      action: `sign:${entryId}`,
      handler: async () => {
        const { entry, client } = await this.resolveEntryAccess(actor, entryId);
        this.assertMutationAllowed(client, "client");
        this.assertMutationAllowed(entry, "entry");

        const updated = await this.mindTrackRepository.updateEntryWithVersion(entryId, expectedVersion, {
          status: "signed",
          updatedAt: new Date()
        });
        if (!updated) {
          throw new AppError("entry version conflict", 409, "VERSION_CONFLICT");
        }

        await this.auditService.logAction({
          actorUserId: actor.id,
          action: "update",
          entityType: "mindtrack_entry",
          entityId: entryId,
          reason: reason || "entry sign",
          before: entry,
          after: updated
        });
        return { statusCode: 200, body: updated };
      }
    });
  }

  async amendEntry({ actor, entryId, expectedVersion, body, idempotencyKey, reason }) {
    if (!["clinician", "administrator"].includes(actor.role)) {
      throw new AppError("insufficient permissions", 403, "FORBIDDEN");
    }

    return this.idempotencyService.execute({
      key: idempotencyKey,
      userId: actor.id,
      action: `amend:${entryId}`,
      handler: async () => {
        const { entry, client } = await this.resolveEntryAccess(actor, entryId);
        this.assertMutationAllowed(client, "client");
        this.assertMutationAllowed(entry, "entry");

        const updated = await this.mindTrackRepository.updateEntryWithVersion(entryId, expectedVersion, {
          status: "amended",
          body,
          updatedAt: new Date()
        });
        if (!updated) {
          throw new AppError("entry version conflict", 409, "VERSION_CONFLICT");
        }

        await this.auditService.logAction({
          actorUserId: actor.id,
          action: "update",
          entityType: "mindtrack_entry",
          entityId: entryId,
          reason: reason || "entry amend",
          before: entry,
          after: updated
        });
        return { statusCode: 200, body: updated };
      }
    });
  }

  async deleteEntry({ actor, entryId, expectedVersion, idempotencyKey, reason }) {
    if (!["clinician", "administrator"].includes(actor.role)) {
      throw new AppError("insufficient permissions", 403, "FORBIDDEN");
    }
    if (!reason || typeof reason !== "string" || !reason.trim()) {
      throw new AppError("deletion reason is required", 400, "INVALID_REQUEST");
    }

    return this.idempotencyService.execute({
      key: idempotencyKey,
      userId: actor.id,
      action: `delete:${entryId}`,
      handler: async () => {
        const { entry, client } = await this.resolveEntryAccess(actor, entryId);
        this.assertMutationAllowed(client, "client");
        this.assertMutationAllowed(entry, "entry");

        if (entry.deletedAt) {
          throw new AppError("entry is already deleted", 409, "ALREADY_DELETED");
        }

        const updated = await this.mindTrackRepository.updateEntryWithVersion(entryId, expectedVersion, {
          deletedAt: new Date(),
          deletedReason: reason.trim(),
          updatedAt: new Date()
        });
        if (!updated) {
          throw new AppError("entry version conflict", 409, "VERSION_CONFLICT");
        }

        await this.auditService.logAction({
          actorUserId: actor.id,
          action: "delete",
          entityType: "mindtrack_entry",
          entityId: entryId,
          reason,
          before: entry,
          after: updated
        });
        return { statusCode: 200, body: updated };
      }
    });
  }

  async restoreEntry({ actor, entryId, expectedVersion, idempotencyKey, reason }) {
    if (!["clinician", "administrator"].includes(actor.role)) {
      throw new AppError("insufficient permissions", 403, "FORBIDDEN");
    }

    return this.idempotencyService.execute({
      key: idempotencyKey,
      userId: actor.id,
      action: `restore:${entryId}`,
      handler: async () => {
        const { entry, client } = await this.resolveEntryAccess(actor, entryId);
        this.assertMutationAllowed(client, "client");
        this.assertMutationAllowed(entry, "entry");

        if (!entry.deletedAt) {
          throw new AppError("entry is not deleted", 409, "NOT_DELETED");
        }

        const updated = await this.mindTrackRepository.updateEntryWithVersion(entryId, expectedVersion, {
          deletedAt: null,
          deletedReason: null,
          updatedAt: new Date()
        });
        if (!updated) {
          throw new AppError("entry version conflict", 409, "VERSION_CONFLICT");
        }

        await this.auditService.logAction({
          actorUserId: actor.id,
          action: "update",
          entityType: "mindtrack_entry",
          entityId: entryId,
          reason: reason || "entry restore",
          before: entry,
          after: updated
        });
        return { statusCode: 200, body: updated };
      }
    });
  }

  async getAttachment({ actor, entryId, fingerprint }) {
    const { entry } = await this.resolveEntryAccess(actor, entryId);
    if (actor.role === "client" && entry.entryType === "counseling_note") {
      throw new AppError("forbidden", 403, "FORBIDDEN");
    }
    const attachment = (entry.attachments || []).find((a) => a.fingerprint === fingerprint);
    if (!attachment) {
      throw new AppError("attachment not found", 404, "ATTACHMENT_NOT_FOUND");
    }
    if (!attachment.storagePath) {
      throw new AppError("attachment file not stored", 404, "ATTACHMENT_NOT_STORED");
    }
    if (!this.attachmentStorageService) {
      throw new AppError("attachment storage not available", 500, "STORAGE_UNAVAILABLE");
    }
    const fileExists = await this.attachmentStorageService.exists(attachment.storagePath);
    if (!fileExists) {
      throw new AppError("attachment file missing from storage", 404, "ATTACHMENT_FILE_MISSING");
    }
    const buffer = await this.attachmentStorageService.retrieve(attachment.storagePath);
    return { buffer, contentType: attachment.type, fileName: attachment.name };
  }

  async searchEntries({ actor, query, from, to, entryType, tags, sort }) {
    let accessFilter;
    if (actor.role === "administrator") {
      accessFilter = {};
    } else if (actor.role === "clinician") {
      const assignedClients = await this.mindTrackRepository.listClients({ primaryClinicianId: actor.id });
      const assignedClientIds = assignedClients.map((c) => c._id);
      accessFilter = assignedClientIds.length ? { clientId: { $in: assignedClientIds } } : { clientId: null };
    } else {
      accessFilter = { clientId: actor.mindTrackClientId };
    }

    const normalizedQuery = String(query || "").trim();
    const terms = tokenize(normalizedQuery);
    const regex = normalizedQuery ? new RegExp(normalizedQuery, "i") : null;
    const entries = await this.mindTrackRepository.searchEntries({
      accessFilter,
      queryRegex: regex,
      from: from ? new Date(from) : null,
      to: to ? new Date(to) : null,
      entryType,
      tags: normalizeTags(tags)
    });
    const templates = await this.mindTrackRepository.searchTemplates({
      queryRegex: regex,
      entryType,
      tags: normalizeTags(tags)
    });

    const scored = entries.map((entry) => {
      const title = String(entry.title || "").toLowerCase();
      const body = String(entry.body || "").toLowerCase();
      const entryTags = (entry.tags || []).join(" ").toLowerCase();
      const relevance = terms.reduce((score, term) => {
        const t = term.toLowerCase();
        return score + (title.includes(t) ? 3 : 0) + (body.includes(t) ? 2 : 0) + (entryTags.includes(t) ? 1 : 0);
      }, terms.length ? 0 : 1);
      return { ...entry, relevance };
    });

    scored.sort(
      sort === "newest"
        ? (a, b) => new Date(b.occurredAt) - new Date(a.occurredAt)
        : (a, b) => b.relevance - a.relevance || new Date(b.occurredAt) - new Date(a.occurredAt)
    );

    if (normalizedQuery) {
      await this.mindTrackRepository.logSearchEvent({
        _id: crypto.randomUUID().replaceAll("-", ""),
        userId: actor.id,
        query: normalizedQuery,
        terms,
        createdAt: new Date()
      });
    }

    const scoredTemplates = actor.role === "client" ? [] : templates.map((template) => {
      const title = String(template.title || "").toLowerCase();
      const body = String(template.body || "").toLowerCase();
      const templateTags = (template.tags || []).join(" ").toLowerCase();
      const relevance = terms.reduce((score, term) => {
        const t = term.toLowerCase();
        return score + (title.includes(t) ? 3 : 0) + (body.includes(t) ? 2 : 0) + (templateTags.includes(t) ? 1 : 0);
      }, terms.length ? 0 : 1);
      return { ...template, relevance };
    }).sort(
      sort === "newest"
        ? (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)
        : (a, b) => b.relevance - a.relevance || new Date(b.updatedAt) - new Date(a.updatedAt)
    );

    return {
      entries: scored.slice(0, 100),
      templates: scoredTemplates.slice(0, 50)
    };
  }

  async trendingTerms(actor) {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const events = await this.mindTrackRepository.listSearchEventsSince(since, { userId: actor.id });
    const termCounts = new Map();
    for (const event of events) {
      for (const term of event.terms || []) {
        termCounts.set(term, (termCounts.get(term) || 0) + 1);
      }
    }
    return [...termCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([term, count]) => ({ term, count }));
  }

  async nearbyFacilities({ actor, clientId, radiusMiles = 25 }) {
    const client = await this.resolveClientAccess(
      actor,
      actor.role === "client" ? actor.mindTrackClientId : clientId
    );
    const parsed = parseUsAddress(client.address);
    const centroid = client.coordinate || centroidFromZip(parsed.zip);
    if (!centroid) {
      return [];
    }

    const boundedRadius = Math.min(Math.max(Number(radiusMiles) || 25, 1), 100);
    const facilities = await this.mindTrackRepository.listFacilities();
    return facilities
      .map((facility) => ({
        ...facility,
        distanceMiles: Number(
          haversineMiles(centroid, {
            lat: facility.coordinate.lat,
            lon: facility.coordinate.lon
          }).toFixed(2)
        )
      }))
      .filter((facility) => facility.distanceMiles <= boundedRadius)
      .sort((a, b) => a.distanceMiles - b.distanceMiles);
  }

  async selfContext(actor) {
    const client = await this.resolveClientAccess(actor, actor.mindTrackClientId);
    const allEntries = await this.mindTrackRepository.listTimeline({ clientId: client._id });
    const timeline = allEntries.filter(
      (entry) => entry.entryType === "assessment" || entry.entryType === "follow_up"
    );
    const upcomingFollowUp = timeline
      .filter((entry) => entry.entryType === "follow_up" && new Date(entry.occurredAt) > new Date())
      .sort((a, b) => new Date(a.occurredAt) - new Date(b.occurredAt))[0] || null;

    return {
      client: this.sanitizeClient(client, actor),
      upcomingFollowUp,
      timeline
    };
  }

  async updateGovernanceControls({ actor, clientId, payload }) {
    if (actor.role !== "administrator") {
      throw new AppError("administrator role required", 403, "FORBIDDEN");
    }

    const client = await this.resolveClientAccess(actor, clientId);

    const updated = await this.mindTrackRepository.updateClient(client._id, {
      legalHold: payload.legalHold,
      retentionUntil: payload.retentionUntil ? new Date(payload.retentionUntil) : client.retentionUntil,
      updatedAt: new Date()
    });

    await this.auditService.logAction({
      actorUserId: actor.id,
      action: "update",
      entityType: "mindtrack_governance",
      entityId: client._id,
      reason: payload.reason || "governance controls update",
      before: { legalHold: client.legalHold, retentionUntil: client.retentionUntil },
      after: { legalHold: updated.legalHold, retentionUntil: updated.retentionUntil }
    });

    return this.sanitizeClient(updated, actor);
  }
}
