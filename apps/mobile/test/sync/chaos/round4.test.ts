import { uuidv7 } from "uuidv7";
import { describe, expect, it } from "vitest";

import { seedCtx, seedUuid } from "../../../../../packages/core/src/auth/testing/seeded";
import { checkInInspection, checkOutInspection } from "../../../../../packages/core/src/modules/rentals/testing/harness";
import { setUserRole } from "../../../../../packages/core/src/modules/users/admin";
import { ORG_SUSPENDED_GRACE_MS, ORG_SUSPENDED_RETRY_AFTER_MS } from "../../../../../packages/core/src/sync/push";
import { mutationRegistry } from "../../../../../packages/core/src/sync/registry";
import { deleteConfirmationMatches, pendingItemCount } from "../../../src/features/settings/logic";
import { checkinRental, checkoutRental } from "../../../src/sync/mutators/rentals";
import { readSyncState, SYNC_STATE_KEYS } from "../../../src/sync/state";
import { expectCatalog } from "./catalog";
import type { ChaosDevice } from "./device";
import { BASE, countRequests, SEED } from "./harness";
import { createAssignedJob } from "./office";
import { createOfflineReport, DAY_MS, PHOTO } from "./scenario";
import { useChaosSuite } from "./suite";

const FIELD_2 = seedUuid(0x69);
const RENTAL_AGENT = seedUuid(0x6b);
const RESERVED_RENTAL = seedUuid(1201);
const admin = seedCtx(SEED.admin, "ADMIN");
const at = { lat: -15.79, lng: -47.88 };

const suite = useChaosSuite();

async function serverCount(collection: string, filter: Record<string, unknown>): Promise<number> {
  return suite.server().seeded.raw(collection).countDocuments(filter as never);
}

async function setOrg(set: Record<string, unknown>): Promise<void> {
  await suite.server().seeded.raw("organizations").updateOne({ _id: SEED.orgA } as never, { $set: set } as never);
}

/** Replaces a core handler so its database writes run and the transaction then fails (A6). */
async function withFailingHandler<T>(name: "rental.checkout" | "rental.checkin", run: () => Promise<T>): Promise<T> {
  const original = mutationRegistry[name];
  mutationRegistry[name] = {
    ...original,
    apply: async (...args: Parameters<typeof original.apply>) => {
      await original.apply(...args);
      throw new Error(`chaos: ${name} failed after its writes`);
    },
  } as typeof original;
  try {
    return await run();
  } finally {
    mutationRegistry[name] = original;
  }
}

async function pushedReports(ids: readonly string[]): Promise<number> {
  return serverCount("field_reports", { _id: { $in: [...ids] } });
}

describe("Round 4 chaos cases", () => {
  it("C17 role change offline: captured work is never rejected for role reasons and drains after the new sign-in", async () => {
    const device = await suite.device("c17");
    device.online = false;
    const ids: string[] = [];
    for (let i = 0; i < 3; i += 1) ids.push((await createOfflineReport(device, i === 0 ? [PHOTO] : [], `Antes da troca ${i + 1}`)).id);

    await setUserRole(admin, SEED.field, { role: "MANAGER" });
    try {
      device.online = true;
      // The role change revokes refresh sessions; the access token still in hand may keep working until it
      // expires. Either way the queue is never rejected for role reasons and waits for a new sign-in if needed.
      await device.sync();
      if (device.authStore.getState().needsReauth) {
        expect(await device.count("SELECT COUNT(*) AS n FROM outbox WHERE status IN ('PENDING', 'IN_FLIGHT')")).toBeGreaterThan(0);
        await device.login(SEED.field);
      }
      expect((await device.syncUntilIdle()).ok).toBe(true);
      expect(await pushedReports(ids)).toBe(3);
      expect(await device.count("SELECT COUNT(*) AS n FROM conflicts WHERE code = 'FORBIDDEN'")).toBe(0);
      expect(await serverCount("processed_mutations", { "result.code": "FORBIDDEN", userId: SEED.field })).toBe(0);
      expect(await pendingItemCount(device.sqlDb)).toBe(0);
    } finally {
      await setUserRole(admin, SEED.field, { role: "FIELD" });
    }
  });

  it("EC-PLT-40 ORG_SUSPENDED inside the 7-day grace: field work is still accepted", async () => {
    expectCatalog("ORG_SUSPENDED", "EC-PLT-40");
    const device = await suite.device("plt40-grace");
    await setOrg({ status: "SUSPENDED", suspendedAt: new Date(Date.now() - 2 * DAY_MS) });
    try {
      device.online = false;
      const report = await createOfflineReport(device, [], "Durante a carência");
      device.online = true;
      expect((await device.syncUntilIdle()).ok).toBe(true);
      expect(await pushedReports([report.id])).toBe(1);
    } finally {
      await setOrg({ status: "ACTIVE", suspendedAt: null });
    }
  });

  it("EC-PLT-40 ORG_SUSPENDED after the grace: the outbox is kept, retried hourly and flushed once on reactivation", async () => {
    const device = await suite.device("plt40-after");
    const server = suite.server();
    await setOrg({ status: "SUSPENDED", suspendedAt: new Date(Date.now() - ORG_SUSPENDED_GRACE_MS - DAY_MS) });
    const ids: string[] = [];
    try {
      device.online = false;
      for (let i = 0; i < 4; i += 1) ids.push((await createOfflineReport(device, i === 0 ? [PHOTO] : [], `Suspensa ${i + 1}`)).id);
      device.online = true;
      await device.sync();

      expect(await pushedReports(ids)).toBe(0);
      expect(await device.count("SELECT COUNT(*) AS n FROM outbox WHERE status = 'PENDING'")).toBe(4);
      const head = await device.sqlDb.get<{ nextAttemptAt: string | null; lastError: string | null }>("SELECT nextAttemptAt, lastError FROM outbox ORDER BY seq ASC LIMIT 1");
      expect(head?.lastError).toBe("RETRY");
      const waitMs = Date.parse(head?.nextAttemptAt ?? "") - device.clock.now();
      expect(waitMs).toBeGreaterThanOrEqual(ORG_SUSPENDED_RETRY_AFTER_MS - 60_000);

      // Inside the hour nothing is re-sent: no rapid retry loop.
      const pushes = countRequests(server, /^POST \/sync\/push/, device.deviceId);
      await device.sync();
      expect(countRequests(server, /^POST \/sync\/push/, device.deviceId)).toBe(pushes);
      expect(await pendingItemCount(device.sqlDb)).toBeGreaterThanOrEqual(4);

      // After the hour the retry still finds the org suspended and keeps everything.
      device.clock.advance(ORG_SUSPENDED_RETRY_AFTER_MS + 60_000);
      await device.sync();
      expect(countRequests(server, /^POST \/sync\/push/, device.deviceId)).toBe(pushes + 1);
      expect(await device.count("SELECT COUNT(*) AS n FROM outbox WHERE status = 'PENDING'")).toBe(4);

      await setOrg({ status: "ACTIVE", suspendedAt: null });
      device.clock.advance(ORG_SUSPENDED_RETRY_AFTER_MS * 2);
      expect((await device.syncUntilIdle()).ok).toBe(true);
      expect(await pushedReports(ids)).toBe(4);
      for (const id of ids) expect(await serverCount("field_reports", { _id: id })).toBe(1);
      expect(await device.count("SELECT COUNT(*) AS n FROM outbox")).toBe(0);
      expect(await pendingItemCount(device.sqlDb)).toBe(0);
    } finally {
      await setOrg({ status: "ACTIVE", suspendedAt: null });
    }
  });

  it("A5 scope shrink with pending outbox: dirty rows survive, clean out-of-scope rows go, and pending commands re-run", async () => {
    expectCatalog("RESET_REQUIRED", "EC-SYN-08");
    const server = suite.server();
    const keptJob = await createAssignedJob(server, "Continua comigo");
    const movedJob = await createAssignedJob(server, "Vai para outro técnico");
    const device = await suite.device("a5");
    expect(await device.count("SELECT COUNT(*) AS n FROM work_orders WHERE id IN (?, ?)", [keptJob, movedJob])).toBe(2);

    device.online = false;
    const report = await createOfflineReport(device, [PHOTO], "Pendente durante o reset");
    // The job leaves the technician's scope entirely (new assignee, no assignment history).
    await server.seeded.raw("work_orders").updateOne({ _id: movedJob } as never, { $set: { assigneeId: FIELD_2, previousAssigneeIds: [] } } as never);
    await server.seeded.raw("users").updateOne({ _id: SEED.field } as never, { $inc: { scopeEpoch: 1 } } as never);

    device.online = true;
    const result = await device.syncUntilIdle();
    expect(result.ok).toBe(true);
    expect(await device.count("SELECT COUNT(*) AS n FROM work_orders WHERE id = ?", [movedJob])).toBe(0);
    expect(await device.count("SELECT COUNT(*) AS n FROM work_orders WHERE id = ?", [keptJob])).toBe(1);
    expect(await device.count("SELECT COUNT(*) AS n FROM field_reports WHERE id = ?", [report.id])).toBe(1);
    expect(await pushedReports([report.id])).toBe(1);
    expect(await serverCount("processed_mutations", { mutationId: { $exists: true }, userId: SEED.field, "result.status": "REJECTED" })).toBe(0);
    expect(await device.count("SELECT COUNT(*) AS n FROM media_files WHERE state = 'DONE'")).toBe(1);
    expect(await readSyncState(device.sqlDb, SYNC_STATE_KEYS.cursor)).not.toBeNull();
  });

  describe("A6 composite rental checkout and check-in are atomic", () => {
    async function rentalDevice(): Promise<{ device: ChaosDevice; assetId: string; hourMeter: number }> {
      const raw = suite.server().seeded.raw;
      const rental = await raw("rentals").findOne({ _id: RESERVED_RENTAL } as never);
      const assetId = String(rental?.assetId);
      // Precondition: the seeded asset is rentable (operational, no open critical report).
      await raw("assets").updateOne({ _id: assetId } as never, { $set: { condition: "OPERATIONAL", currentRentalId: null } } as never);
      await raw("field_reports").updateMany({ assetId } as never, { $set: { machineOperable: true, priority: "LOW" } } as never);
      const device = await suite.device("a6", RENTAL_AGENT);
      const asset = await raw("assets").findOne({ _id: assetId } as never);
      return { device, assetId, hourMeter: Number(asset?.hourMeter ?? 0) };
    }

    it("a failure after the checkout writes leaves rental, inspection, signatures and asset untouched; the retry commits all of it once", async () => {
      const { device, assetId, hourMeter } = await rentalDevice();
      expect(await device.count("SELECT COUNT(*) AS n FROM rentals WHERE id = ? AND status = 'RESERVED'", [RESERVED_RENTAL])).toBe(1);
      const out = checkOutInspection(assetId, { id: uuidv7(), hourMeter: hourMeter + 2, accessories: [] });
      device.online = false;
      await checkoutRental({ rentalId: RESERVED_RENTAL, inspection: out }, { runtime: device.rt, ...at });
      expect(await device.count("SELECT COUNT(*) AS n FROM rentals WHERE id = ? AND status = 'ACTIVE'", [RESERVED_RENTAL])).toBe(1);
      device.online = true;

      await withFailingHandler("rental.checkout", async () => {
        await device.sync();
      });
      expect(await serverCount("rentals", { _id: RESERVED_RENTAL, status: "RESERVED", checkOutInspectionId: null })).toBe(1);
      expect(await serverCount("inspections", { _id: out.id })).toBe(0);
      expect(await serverCount("media", { _id: { $in: [out.customerSignatureMediaId, out.agentSignatureMediaId] } })).toBe(0);
      expect(await serverCount("assets", { _id: assetId, currentRentalId: RESERVED_RENTAL })).toBe(0);
      expect(await serverCount("processed_mutations", { mutationId: { $exists: true }, "result.status": "APPLIED", userId: RENTAL_AGENT })).toBe(0);
      expect(await device.count("SELECT COUNT(*) AS n FROM outbox WHERE name = 'rental.checkout' AND status = 'PENDING'")).toBe(1);

      device.clock.advance(DAY_MS);
      expect((await device.syncUntilIdle()).ok).toBe(true);
      expect(await serverCount("rentals", { _id: RESERVED_RENTAL, status: "ACTIVE", checkOutInspectionId: out.id })).toBe(1);
      expect(await serverCount("inspections", { _id: out.id })).toBe(1);
      expect(await serverCount("media", { _id: { $in: [out.customerSignatureMediaId, out.agentSignatureMediaId] } })).toBe(2);
      expect(await serverCount("assets", { _id: assetId, currentRentalId: RESERVED_RENTAL })).toBe(1);

      const charges = await serverCount("rental_charges", { rentalId: RESERVED_RENTAL });
      const back = checkInInspection(assetId, { id: uuidv7(), hourMeter: hourMeter + 10, meterJumpConfirmed: true, accessories: [] });
      device.online = false;
      await checkinRental({ rentalId: RESERVED_RENTAL, inspection: back, damageCosts: [] }, { runtime: device.rt, ...at });
      device.online = true;
      await withFailingHandler("rental.checkin", async () => {
        await device.sync();
      });
      expect(await serverCount("rentals", { _id: RESERVED_RENTAL, status: "ACTIVE", checkInInspectionId: null })).toBe(1);
      expect(await serverCount("inspections", { _id: back.id })).toBe(0);
      expect(await serverCount("rental_charges", { rentalId: RESERVED_RENTAL })).toBe(charges);
      expect(await serverCount("assets", { _id: assetId, currentRentalId: RESERVED_RENTAL })).toBe(1);

      device.clock.advance(DAY_MS);
      expect((await device.syncUntilIdle()).ok).toBe(true);
      expect(await serverCount("rentals", { _id: RESERVED_RENTAL, status: "RETURNED", checkInInspectionId: back.id })).toBe(1);
      expect(await serverCount("inspections", { rentalId: RESERVED_RENTAL })).toBe(2);
      expect(await serverCount("rental_charges", { rentalId: RESERVED_RENTAL })).toBeGreaterThan(charges);
      expect(await serverCount("assets", { _id: assetId, currentRentalId: null })).toBe(1);
      expect(await device.count("SELECT COUNT(*) AS n FROM outbox")).toBe(0);
    });
  });

  // Last in the file: it deletes the seeded field technician.
  it("EC-PLT-42 ACCOUNT_DELETE_PENDING_DATA: the pending sheet gates deletion until the queue is empty", async () => {
    expectCatalog("ACCOUNT_DELETE_PENDING_DATA", "EC-PLT-42");
    const device = await suite.device("plt42");
    device.online = false;
    const report = await createOfflineReport(device, [PHOTO], "Antes de excluir a conta");
    const pending = await pendingItemCount(device.sqlDb);
    // The settings screen opens the ACCOUNT_DELETE_PENDING_DATA sheet instead of the delete sheet.
    expect(pending).toBeGreaterThan(0);
    expect(await serverCount("field_reports", { _id: report.id })).toBe(0);

    // "Send now" on the sheet: sync drains everything, then the delete sheet may open.
    device.online = true;
    expect((await device.syncUntilIdle()).ok).toBe(true);
    expect(await pendingItemCount(device.sqlDb)).toBe(0);
    expect(await serverCount("field_reports", { _id: report.id })).toBe(1);

    expect(deleteConfirmationMatches(" excluir ", "EXCLUIR")).toBe(true);
    const response = await device.fetch(`${BASE}/api/v1/auth/me`, {
      method: "DELETE",
      headers: { "content-type": "application/json", authorization: `Bearer ${await device.auth.accessToken()}` },
      body: JSON.stringify({ confirm: "EXCLUIR" }),
    });
    expect(response.status).toBeLessThan(300);
    expect(await serverCount("users", { _id: SEED.field, deletedAt: { $ne: null } })).toBe(1);
    // The work sent before deletion stays with the organisation.
    expect(await serverCount("field_reports", { _id: report.id })).toBe(1);
  });
});
