import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DomainError } from "../errors.js";
import { createSeededDb, SEED, seedCtx, seedUuid, type SeededDb } from "../auth/testing/seeded.js";
import { mutationRegistry } from "./registry.js";
import { push } from "./push.js";

const DEVICE = "018fd000-0000-7000-8000-00000000d001";
const FIELD_103 = seedUuid(103);
const FIELD_104 = seedUuid(104);

function request(mutations: { id?: string; name: string; payload: unknown }[], clientTime = new Date().toISOString()) {
  return {
    deviceId: DEVICE,
    clientTime,
    deviceStatus: { appVersion: "1.0.0", runtimeVersion: "1", pendingMutations: mutations.length, pendingUploads: 0, pendingBytes: 0, scopeEpoch: 0 },
    mutations: mutations.map((m) => ({ id: m.id ?? randomUUID(), name: m.name, payload: m.payload, occurredAt: new Date().toISOString() })),
  };
}

let seeded: SeededDb;

beforeAll(async () => {
  seeded = await createSeededDb("push");
}, 60_000);

afterAll(async () => {
  await seeded.close();
});

describe("sync push", () => {
  it("applies a mutation, stores ProcessedMutation and replays the stored result", async () => {
    const ctx = seedCtx(FIELD_103, "FIELD");
    const id = randomUUID();
    const body = request([{ id, name: "user.setDuty", payload: { status: "ON_DUTY" } }]);
    const first = await push(ctx, body);
    expect(first.results).toEqual([{ id, status: "APPLIED" }]);
    const user = await seeded.raw("users").findOne({ _id: FIELD_103 });
    expect(user?.dutyStatus).toBe("ON_DUTY");
    const processed = await seeded.raw("processed_mutations").findOne({ _id: `${SEED.orgA}:${id}` });
    expect(processed?.requestHash).toMatch(/^[0-9a-f]{64}$/u);
    const outbox = await seeded.raw("event_outbox").findOne({ type: "operator:presence" });
    expect(outbox).not.toBeNull();

    const replay = await push(ctx, body);
    expect(replay.results).toEqual(first.results);
    const device = await seeded.raw("devices").findOne({ installationId: DEVICE });
    expect(device?.userId).toBe(FIELD_103);
    expect(device?.appVersion).toBe("1.0.0");
  });

  it("rejects reuse of a mutation id with a different payload", async () => {
    const ctx = seedCtx(FIELD_103, "FIELD");
    const id = randomUUID();
    await push(ctx, request([{ id, name: "user.setDuty", payload: { status: "OFF_DUTY" } }]));
    const reuse = await push(ctx, request([{ id, name: "user.setDuty", payload: { status: "ON_DUTY" } }]));
    expect(reuse.results[0]).toMatchObject({ status: "REJECTED", code: "VALIDATION_FAILED", details: { context: "mutationIdReuse" } });
  });

  it("returns UNKNOWN_MUTATION per envelope and continues the batch", async () => {
    const ctx = seedCtx(FIELD_103, "FIELD");
    const result = await push(ctx, request([
      { name: "rocket.launch", payload: {} },
      { name: "user.setDuty", payload: { status: "OFF_DUTY" } },
    ]));
    expect(result.results.map((r) => r.status)).toEqual(["REJECTED", "APPLIED"]);
    expect(result.results[0]).toMatchObject({ code: "UNKNOWN_MUTATION" });
  });

  it("rejects an invalid payload with VALIDATION_FAILED", async () => {
    const result = await push(seedCtx(FIELD_103, "FIELD"), request([{ name: "user.setDuty", payload: { status: "SLEEPING" } }]));
    expect(result.results[0]).toMatchObject({ status: "REJECTED", code: "VALIDATION_FAILED" });
    expect((result.results[0] as { details?: Record<string, unknown> }).details?.context).toBeUndefined();
  });

  it("adds the schemaUpdate context when an older app sends a payload the schema no longer accepts (EC-SYN-09)", async () => {
    const minAppVersions = { "user.setDuty": "1.2.0" };
    const old = await push(seedCtx(FIELD_103, "FIELD"), request([{ name: "user.setDuty", payload: { status: "SLEEPING" } }]), { minAppVersions });
    expect(old.results[0]).toMatchObject({ status: "REJECTED", code: "VALIDATION_FAILED", details: { context: "schemaUpdate", minAppVersion: "1.2.0" } });

    const current = { ...request([{ name: "user.setDuty", payload: { status: "SLEEPING" } }]) };
    const upToDate = await push(seedCtx(FIELD_103, "FIELD"), { ...current, deviceStatus: { ...current.deviceStatus, appVersion: "1.10.0" } }, { minAppVersions });
    expect(upToDate.results[0]).toMatchObject({ status: "REJECTED", code: "VALIDATION_FAILED" });
    expect((upToDate.results[0] as { details?: Record<string, unknown> }).details?.context).toBeUndefined();
  });

  it("rejects a domain error with a snapshot and stores the rejection", async () => {
    await seeded.raw("users").updateOne({ _id: seedUuid(105) }, { $set: { locationConsentAt: null, dutyStatus: "OFF_DUTY" } });
    const ctx = seedCtx(seedUuid(105), "FIELD");
    const id = randomUUID();
    const result = await push(ctx, request([{ id, name: "user.setDuty", payload: { status: "ON_DUTY" } }]));
    expect(result.results[0]).toMatchObject({ status: "REJECTED", code: "LOCATION_CONSENT_REQUIRED", snapshot: { table: "users" } });
    const processed = await seeded.raw("processed_mutations").findOne({ _id: `${SEED.orgA}:${id}` });
    expect(processed?.result).toMatchObject({ status: "REJECTED" });

    const consent = await push(ctx, request([{ name: "user.setDuty", payload: { status: "ON_DUTY", consent: true } }]));
    expect(consent.results[0]?.status).toBe("APPLIED");
    const user = await seeded.raw("users").findOne({ _id: seedUuid(105) });
    expect(user?.locationConsentAt).toBeInstanceOf(Date);
  });

  it("returns RETRY on an unexpected error and stops the batch", async () => {
    const boom = { ...mutationRegistry["user.setDuty"], apply: async () => { throw new Error("db down"); } };
    const result = await push(
      seedCtx(FIELD_103, "FIELD"),
      request([
        { name: "user.setDuty", payload: { status: "OFF_DUTY" } },
        { name: "user.setDuty", payload: { status: "OFF_DUTY" } },
      ]),
      { handlers: { "user.setDuty": boom } },
    );
    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.status).toBe("RETRY");
  });

  it("rolls back handler writes when a domain error is thrown", async () => {
    const partial = {
      ...mutationRegistry["user.setDuty"],
      apply: async (tx: Parameters<(typeof mutationRegistry)["user.setDuty"]["apply"]>[0]) => {
        const { txDb } = await import("./touch.js");
        await txDb(tx).users.updateOne({ _id: FIELD_103 }, { $set: { phone: "rolled-back" } });
        throw new DomainError("FORBIDDEN");
      },
    };
    const result = await push(seedCtx(FIELD_103, "FIELD"), request([{ name: "user.setDuty", payload: { status: "OFF_DUTY" } }]), { handlers: { "user.setDuty": partial } });
    expect(result.results[0]).toMatchObject({ status: "REJECTED", code: "FORBIDDEN" });
    const user = await seeded.raw("users").findOne({ _id: FIELD_103 });
    expect(user?.phone).not.toBe("rolled-back");
  });

  it("drain tokens may only push evidence mutations", async () => {
    const result = await push(seedCtx(FIELD_103, "FIELD"), request([{ name: "user.setDuty", payload: { status: "OFF_DUTY" } }]), { drain: true });
    expect(result.results[0]).toMatchObject({ status: "REJECTED", code: "ACCOUNT_DISABLED" });
  });

  it("registers late evidence on a completed work order and notifies the office", async () => {
    const workOrderId = seedUuid(1112);
    const mediaId = randomUUID();
    const result = await push(seedCtx(FIELD_104, "FIELD"), request([{
      name: "media.register",
      payload: { id: mediaId, kind: "PHOTO", tag: "AFTER", mimeType: "image/jpeg", capturedAt: new Date().toISOString(), parent: { type: "WORK_ORDER", id: workOrderId } },
    }]));
    expect(result.results[0]?.status).toBe("APPLIED");
    const media = await seeded.raw("media").findOne({ _id: mediaId });
    expect(media).toMatchObject({ isLateEvidence: true, status: "PENDING", capturedById: FIELD_104 });
    expect(String(media?.storageKey)).toMatch(new RegExp(`^org/${SEED.orgA}/media/\\d{4}/\\d{2}/${mediaId}\\.jpg$`, "u"));
    const workOrder = await seeded.raw("work_orders").findOne({ _id: workOrderId });
    expect(workOrder?.hasLateEvidence).toBe(true);
    const notes = await seeded.raw("notifications").find({ type: "LATE_EVIDENCE" }).toArray();
    expect(notes.map((n) => n.userId).sort()).toEqual([SEED.admin, SEED.manager, seedUuid(102)].sort());
  });

  it("forbids media on a work order the field user never held", async () => {
    const result = await push(seedCtx(seedUuid(107), "FIELD"), request([{
      name: "media.register",
      payload: { id: randomUUID(), kind: "PHOTO", tag: "AFTER", mimeType: "image/jpeg", capturedAt: new Date().toISOString(), parent: { type: "WORK_ORDER", id: seedUuid(1112) } },
    }]));
    expect(result.results[0]).toMatchObject({ status: "REJECTED", code: "FORBIDDEN" });
  });

  it("marks own notifications read", async () => {
    const id = seedUuid(2000);
    const result = await push(seedCtx(FIELD_104, "FIELD"), request([{ name: "notification.markRead", payload: { ids: [id] } }]));
    expect(result.results[0]?.status).toBe("APPLIED");
    const note = await seeded.raw("notifications").findOne({ _id: id });
    expect(note?.readAt).toBeInstanceOf(Date);
  });

  it("returns RETRY with a one hour backoff after the suspension grace period", async () => {
    await seeded.raw("organizations").updateOne({ _id: SEED.orgA }, { $set: { status: "SUSPENDED", suspendedAt: new Date(Date.now() - 8 * 86_400_000) } });
    try {
      const result = await push(seedCtx(FIELD_103, "FIELD"), request([{ name: "user.setDuty", payload: { status: "OFF_DUTY" } }]));
      expect(result.results).toEqual([expect.objectContaining({ status: "RETRY", retryAfterMs: 3_600_000 })]);
    } finally {
      await seeded.raw("organizations").updateOne({ _id: SEED.orgA }, { $set: { status: "ACTIVE", suspendedAt: null } });
    }
  });
});
