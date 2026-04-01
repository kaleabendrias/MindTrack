import {
  enforceAllowedKeys,
  requireEnum,
  requireId,
  requireNonEmptyString,
  requireObject,
  requireOptionalDate,
  requireOptionalEnum,
  requireNumberInRange
} from "./requestValidation.js";

function validateAttachments(attachments) {
  if (attachments === undefined) {
    return;
  }

  if (!Array.isArray(attachments)) {
    throw new Error("attachments must be an array");
  }

  if (attachments.length > 20) {
    throw new Error("max 20 attachments per entry");
  }

  for (const attachment of attachments) {
    requireObject(attachment, "attachment");
    enforceAllowedKeys(attachment, ["name", "type", "sizeBytes", "fingerprint"], "attachment");
    requireNonEmptyString(attachment.name, "attachment name", 255);
    requireNonEmptyString(attachment.type, "attachment type", 120);
    requireNonEmptyString(attachment.fingerprint, "attachment fingerprint", 300);
    if (!Number.isFinite(Number(attachment.sizeBytes))) {
      throw new Error("attachment sizeBytes must be numeric");
    }
  }
}

export function validateCreateClient(req) {
  requireObject(req.body, "body");
  enforceAllowedKeys(req.body, ["name", "dob", "phone", "address", "tags", "channel", "reason", "primaryClinicianId"], "body");
  requireNonEmptyString(req.body.name, "name", 120);
  requireNonEmptyString(req.body.dob, "dob", 40);
  requireNonEmptyString(req.body.phone, "phone", 40);
  requireNonEmptyString(req.body.address, "address", 250);
  if (Object.prototype.hasOwnProperty.call(req.body, "primaryClinicianId") && req.body.primaryClinicianId !== null && req.body.primaryClinicianId !== "") {
    requireNonEmptyString(req.body.primaryClinicianId, "primaryClinicianId", 64);
  }
  if (req.body.channel) {
    requireEnum(req.body.channel, "channel", ["in_person", "telehealth", "phone"]);
  }
}

export function validateUpdateClient(req) {
  requireObject(req.body, "body");
  enforceAllowedKeys(req.body, ["phone", "address", "tags", "channel", "reason"], "body");
  if (req.body.channel) {
    requireEnum(req.body.channel, "channel", ["in_person", "telehealth", "phone"]);
  }
  requireId(req.params.clientId, "clientId");
}

export function validateGovernanceUpdate(req) {
  requireObject(req.body, "body");
  enforceAllowedKeys(req.body, ["legalHold", "retentionUntil", "reason"], "body");
  requireNonEmptyString(req.body.reason, "reason", 255);
}

export function validateMergeClients(req) {
  requireObject(req.body, "body");
  enforceAllowedKeys(req.body, ["primaryClientId", "duplicateClientId", "reason"], "body");
  requireNonEmptyString(req.body.primaryClientId, "primaryClientId", 64);
  requireNonEmptyString(req.body.duplicateClientId, "duplicateClientId", 64);
  requireNonEmptyString(req.body.reason, "reason", 255);
}

export function validateTimelineRequest(req) {
  requireId(req.params.clientId, "clientId");
}

export function validateSearchRequest(req) {
  requireOptionalDate(req.query.from, "from");
  requireOptionalDate(req.query.to, "to");
  if (req.query.from && req.query.to && new Date(req.query.from) > new Date(req.query.to)) {
    throw new Error("from must be earlier than or equal to to");
  }
  requireOptionalEnum(req.query.channel, "channel", ["assessment", "counseling_note", "follow_up"]);
  requireOptionalEnum(req.query.sort, "sort", ["relevance", "newest"]);
}

export function validateNearbyRequest(req) {
  requireId(req.query.clientId, "clientId");
  requireNumberInRange(req.query.radiusMiles || 25, "radiusMiles", 1, 100);
}

export function validateCreateEntry(req) {
  requireObject(req.body, "body");
  enforceAllowedKeys(
    req.body,
    ["clientId", "entryType", "title", "body", "tags", "channel", "status", "occurredAt", "attachments", "reason"],
    "body"
  );

  requireNonEmptyString(req.body.clientId, "clientId", 64);
  requireEnum(req.body.entryType, "entryType", ["assessment", "counseling_note", "follow_up"]);
  requireNonEmptyString(req.body.title, "title", 200);
  requireNonEmptyString(req.body.body, "body", 4000);
  if (req.body.channel) {
    requireEnum(req.body.channel, "channel", ["in_person", "telehealth", "phone"]);
  }
  if (req.body.status) {
    requireEnum(req.body.status, "status", ["draft", "signed", "amended"]);
  }
  validateAttachments(req.body.attachments);
}

export function validateCriticalWrite(req) {
  requireObject(req.body, "body");
  if (!Number.isInteger(req.body.expectedVersion) || req.body.expectedVersion < 1) {
    throw new Error("expectedVersion must be an integer >= 1");
  }
  requireNonEmptyString(req.body.reason, "reason", 255);
}

export function validateAmendEntry(req) {
  validateCriticalWrite(req);
  requireNonEmptyString(req.body.body, "body", 4000);
}
