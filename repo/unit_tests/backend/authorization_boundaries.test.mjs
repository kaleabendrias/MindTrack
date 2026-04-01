import test from "node:test";
import assert from "node:assert/strict";
import { MindTrackService } from "../../apps/backend/src/application/services/MindTrackService.js";

function createService() {
  return new MindTrackService({
    mindTrackRepository: {
      findClientById: async (id) => ({
        _id: id,
        name: "Jordan Miles",
        phone: "+1-212-555-0144",
        address: "101 Hudson St",
        primaryClinicianId: "clin1",
        legalHold: false,
        retentionUntil: new Date("2033-01-01T00:00:00.000Z")
      }),
      listClients: async () => [],
      listTimeline: async () => []
    },
    auditService: { logAction: async () => {} },
    idempotencyService: { execute: async ({ handler }) => handler() }
  });
}

test("client role can only access own client context", async () => {
  const service = createService();
  const actor = { id: "u1", role: "client", permissions: [], mindTrackClientId: "cli001" };
  const own = await service.resolveClientAccess(actor, "cli001");
  assert.equal(own._id, "cli001");
  await assert.rejects(() => service.resolveClientAccess(actor, "cli999"));
});

test("clinician role is limited to assigned primary clinician context", async () => {
  const service = createService();
  const actor = { id: "clin1", role: "clinician", permissions: [], mindTrackClientId: null };
  const own = await service.resolveClientAccess(actor, "cli001");
  assert.equal(own.primaryClinicianId, "clin1");
  await assert.rejects(() =>
    service.resolveClientAccess({ id: "clin2", role: "clinician", permissions: [] }, "cli001")
  );
});
