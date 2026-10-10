import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createSeededDb, SEED, seedCtx, seedUuid, type SeededDb } from "../../auth/testing/seeded";
import { listActiveTechnicians, listMediaForParent, markLateEvidence, createSeamNotification, notificationOfficeRecipients, touchSyncDependents } from "../../seams";
import { withSyncTx } from "../../sync/withSyncTx";

/** The six T02 seams of DELIVERY-PLAN §4, exercised through `seams.ts` against the seed. */

let seeded: SeededDb;
const admin = seedCtx(SEED.admin, "ADMIN");

beforeAll(async () => {
  seeded = await createSeededDb("seams");
}, 60_000);

afterAll(async () => {
  await seeded.close();
});

describe("T02 seams", () => {
  it("users.listActiveTechnicians returns only active FIELD users of the org", async () => {
    const technicians = await withSyncTx(admin, (tx) => listActiveTechnicians(tx, SEED.orgA));
    expect(technicians.length).toBeGreaterThan(0);
    const ids = technicians.map((technician) => technician.id);
    const rows = await seeded.raw("users").find({ _id: { $in: ids } }).toArray();
    expect(rows.every((row) => row.role === "FIELD" && row.organizationId === SEED.orgA && row.isActive === true)).toBe(true);
    expect(ids).not.toContain(SEED.orgBUser);
  });

  it("media.listForParent and media.markLateEvidence work on a field report's media", async () => {
    const parent = { entityType: "FIELD_REPORT" as const, entityId: seedUuid(1000) };
    const media = await withSyncTx(admin, (tx) => listMediaForParent(tx, parent));
    expect(media.length).toBeGreaterThan(0);
    const id = media[0]?.id ?? "";
    await withSyncTx(admin, (tx) => markLateEvidence(tx, [id]));
    expect((await seeded.raw("media").findOne({ _id: id }))?.isLateEvidence).toBe(true);
  });

  it("notifications.create renders in the recipient locale and writes a push outbox row", async () => {
    const recipients = await withSyncTx(admin, (tx) => notificationOfficeRecipients(tx, SEED.orgA, ["ADMIN"]));
    expect(recipients).toContain(SEED.admin);
    expect(await withSyncTx(admin, (tx) => notificationOfficeRecipients(tx, SEED.orgB, ["ADMIN"]))).toEqual([]);
    await withSyncTx(admin, (tx) =>
      createSeamNotification(tx, { type: "WO_ASSIGNED", userIds: [SEED.field], entity: { entityType: "WORK_ORDER", entityId: seedUuid(1100) }, params: { title: "Seam check" } }),
    );
    const row = await seeded.raw("notifications").findOne({ userId: SEED.field, entityId: seedUuid(1100), type: "WO_ASSIGNED" });
    expect(row?.body).toContain("Seam check");
    const outbox = await seeded.raw("event_outbox").findOne({ "payload.pushNotificationIds": row?._id });
    expect(outbox?.dispatchedAt ?? null).toBeNull();
  });

  it("sync.touchDependents bumps a work order's report media", async () => {
    const before = await seeded.raw("media").findOne({ "parent.type": "FIELD_REPORT", "parent.id": seedUuid(1000) });
    await withSyncTx(admin, (tx) => touchSyncDependents(tx, { entityType: "WORK_ORDER", entityId: seedUuid(1100) }));
    const after = await seeded.raw("media").findOne({ _id: before?._id ?? "" });
    expect(Number(after?.syncVersion)).toBeGreaterThan(Number(before?.syncVersion));
  });
});
