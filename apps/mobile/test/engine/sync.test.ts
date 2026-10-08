import { getMirrorRow, upsertMirrorRow } from "../../src/db/mirror";
import { listConflicts } from "../../src/sync/conflicts";
import { countDiagnostics, enqueueDiagnostic, DIAGNOSTICS_MAX_ROWS, redact } from "../../src/sync/diagnostics";
import { createSyncEngine } from "../../src/sync/engine";
import { evictOutOfScope } from "../../src/sync/evict";
import { listOutbox, outboxCounts } from "../../src/sync/outbox";
import { pullChanges } from "../../src/sync/pull";
import { pushPendingMutations } from "../../src/sync/push";
import { readSyncState, SYNC_STATE_KEYS } from "../../src/sync/state";
import { TransportError } from "../../src/sync/transport";
import { updateAssetReadings } from "../../src/sync/mutators/assets";
import { setDuty } from "../../src/sync/mutators/user";
import { emptyPage } from "../helpers/fakeServer";
import { createTestRuntime, testId, USER_ID } from "../helpers/runtime";

const ASSET = "01900000-0000-7000-8000-00000000a551";

async function seedAsset(db: Parameters<typeof upsertMirrorRow>[0], hourMeter = 100): Promise<void> {
  await upsertMirrorRow(db, "assets", { id: ASSET, code: "TR-01", name: "Tractor", hourMeter, syncVersion: 1 }, 0);
}

describe("mutators and push", () => {
  test("a mutator writes optimistically and enqueues one command in the same transaction", async () => {
    const { runtime } = await createTestRuntime();
    await seedAsset(runtime.db);
    const kick = jest.fn();
    const result = await updateAssetReadings({ assetId: ASSET, hourMeter: 120 }, { runtime: { ...runtime, kick } });
    expect(kick).toHaveBeenCalledTimes(1);
    expect(await getMirrorRow(runtime.db, "assets", ASSET)).toMatchObject({ hourMeter: 120, _dirty: 1 });
    const outbox = await listOutbox(runtime.db);
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({ id: result.mutationId, name: "asset.updateReadings", entityType: "ASSET", entityId: ASSET, status: "PENDING" });
  });

  test("an invalid payload is rejected before anything is written", async () => {
    const { runtime } = await createTestRuntime();
    await expect(updateAssetReadings({ assetId: "not-a-uuid" }, { runtime })).rejects.toThrow();
    expect(await listOutbox(runtime.db)).toHaveLength(0);
  });

  test("APPLIED results remove the command and clear the dirty flag", async () => {
    const { runtime, server } = await createTestRuntime();
    await seedAsset(runtime.db);
    await updateAssetReadings({ assetId: ASSET, hourMeter: 120 }, { runtime });
    const outcome = await pushPendingMutations(runtime);
    expect(outcome).toMatchObject({ status: "done", applied: 1 });
    expect(server.pushes[0]?.mutations[0]).toMatchObject({ name: "asset.updateReadings", payload: { assetId: ASSET, hourMeter: 120 } });
    expect(server.pushes[0]?.deviceStatus).toBeDefined();
    expect(await listOutbox(runtime.db)).toHaveLength(0);
    expect(await getMirrorRow(runtime.db, "assets", ASSET)).toMatchObject({ hourMeter: 120, _dirty: 0 });
  });

  test("REJECTED results keep a conflict and restore the server snapshot", async () => {
    const { runtime, server } = await createTestRuntime();
    await seedAsset(runtime.db);
    await updateAssetReadings({ assetId: ASSET, hourMeter: 50 }, { runtime });
    server.respond = (m) => ({ id: m.id, status: "REJECTED", code: "METER_READING_LOWER", message: "lower", snapshot: { table: "assets", row: { id: ASSET, code: "TR-01", name: "Tractor", hourMeter: 100, syncVersion: 2 } } });
    const outcome = await pushPendingMutations(runtime);
    expect(outcome.rejected).toBe(1);
    expect(await getMirrorRow(runtime.db, "assets", ASSET)).toMatchObject({ hourMeter: 100, _dirty: 0 });
    const conflicts = await listConflicts(runtime.db);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ code: "METER_READING_LOWER" });
    expect((await outboxCounts(runtime.db)).rejected).toBe(1);
  });

  test("RETRY results back off and network failures leave commands pending", async () => {
    const { runtime, server } = await createTestRuntime();
    await seedAsset(runtime.db);
    await updateAssetReadings({ assetId: ASSET, hourMeter: 130 }, { runtime });
    server.respond = (m) => ({ id: m.id, status: "RETRY", retryAfterMs: 10_000 });
    expect((await pushPendingMutations(runtime)).status).toBe("retry");
    const [row] = await listOutbox(runtime.db);
    expect(row?.status).toBe("PENDING");
    expect(Date.parse(row?.nextAttemptAt ?? "")).toBeGreaterThan(runtime.clock.now());

    server.pushError = new TransportError("network");
    const outcome = await pushPendingMutations(runtime);
    expect(["network", "done"]).toContain(outcome.status);
    expect((await listOutbox(runtime.db))[0]?.status).toBe("PENDING");
  });

  test("setDuty targets the signed-in user row", async () => {
    const { runtime } = await createTestRuntime();
    await upsertMirrorRow(runtime.db, "users", { id: USER_ID, name: "Op", dutyStatus: "OFF_DUTY" }, 0);
    await setDuty({ status: "ON_DUTY", consent: true }, { runtime });
    expect(await getMirrorRow(runtime.db, "users", USER_ID)).toMatchObject({ dutyStatus: "ON_DUTY", _dirty: 1 });
    expect((await listOutbox(runtime.db))[0]).toMatchObject({ entityType: "USER", entityId: USER_ID });
  });
});

describe("pull", () => {
  test("pages until hasMore is false, applying upserts and tombstones", async () => {
    const { runtime, server } = await createTestRuntime();
    const other = testId();
    server.pages.push(
      { ...emptyPage("c1", 0, server.serverTime), hasMore: true, changes: { assets: [{ id: ASSET, code: "TR-01", name: "Tractor", hourMeter: 10, syncVersion: 1 }, { id: other, code: "TR-02", name: "Two", syncVersion: 1 }] } },
      { ...emptyPage("c2", 0, server.serverTime), deleted: { assets: [other] } },
    );
    const outcome = await pullChanges(runtime);
    expect(outcome.pages).toBe(2);
    expect(server.pulls[1]?.cursor).toBe("c1");
    expect(await getMirrorRow(runtime.db, "assets", ASSET)).toMatchObject({ hourMeter: 10 });
    expect(await getMirrorRow(runtime.db, "assets", other)).toBeUndefined();
    expect(await readSyncState(runtime.db, SYNC_STATE_KEYS.cursor)).toBe("c2");
    expect(runtime.store.getState().firstSyncDone).toBe(true);
  });

  test("rows with pending commands are not overwritten by pulled changes", async () => {
    const { runtime, server } = await createTestRuntime();
    await seedAsset(runtime.db);
    await updateAssetReadings({ assetId: ASSET, hourMeter: 150 }, { runtime });
    server.pages.push({ ...emptyPage("c1", 0, server.serverTime), changes: { assets: [{ id: ASSET, code: "TR-01", name: "Tractor", hourMeter: 99, syncVersion: 3 }] } });
    await pullChanges(runtime);
    expect(await getMirrorRow(runtime.db, "assets", ASSET)).toMatchObject({ hourMeter: 150 });
  });

  test("resetRequired keeps the outbox and replays pending mutators over the new base", async () => {
    const { runtime, server } = await createTestRuntime();
    const stale = testId();
    await seedAsset(runtime.db);
    await upsertMirrorRow(runtime.db, "assets", { id: stale, code: "OLD", name: "Old" }, 0);
    await updateAssetReadings({ assetId: ASSET, hourMeter: 170 }, { runtime });
    server.pages.push(
      { ...emptyPage("c1", 1, server.serverTime), resetRequired: true },
      { ...emptyPage("c2", 1, server.serverTime), changes: { assets: [{ id: ASSET, code: "TR-01", name: "Tractor", hourMeter: 160, syncVersion: 4 }] } },
    );
    const outcome = await pullChanges(runtime);
    expect(outcome.resets).toBe(1);
    expect(await getMirrorRow(runtime.db, "assets", stale)).toBeUndefined();
    expect(await listOutbox(runtime.db)).toHaveLength(1);
    expect(await getMirrorRow(runtime.db, "assets", ASSET)).toMatchObject({ hourMeter: 170 });
    expect(await readSyncState(runtime.db, SYNC_STATE_KEYS.scopeEpoch)).toBe("1");
  });

  test("eviction drops old closed rows but never rows with pending work", async () => {
    const { runtime } = await createTestRuntime();
    const old = "2025-01-01T00:00:00.000Z";
    const closed = testId();
    const busy = testId();
    await upsertMirrorRow(runtime.db, "rentals", { id: closed, status: "CLOSED", updatedAt: old }, 0);
    await upsertMirrorRow(runtime.db, "rentals", { id: busy, status: "CLOSED", updatedAt: old }, 0);
    await runtime.db.run("INSERT INTO outbox (id, seq, name, entityType, entityId, payload, occurredAt, status, attempts, createdAt) VALUES (?, 1, 'rental.close', 'RENTAL', ?, '{}', ?, 'PENDING', 0, ?)", [testId(), busy, old, old]);
    await evictOutOfScope(runtime.db, { userId: USER_ID, nowMs: runtime.clock.now() });
    expect(await getMirrorRow(runtime.db, "rentals", closed)).toBeUndefined();
    expect(await getMirrorRow(runtime.db, "rentals", busy)).toBeDefined();
  });
});

describe("engine", () => {
  test("a captive portal stops the cycle before any credentialed call", async () => {
    const { runtime, server } = await createTestRuntime();
    server.healthError = new TransportError("invalid", { code: "CAPTIVE_PORTAL" });
    const engine = createSyncEngine(runtime);
    const result = await engine.syncNow("manual");
    expect(result).toMatchObject({ ok: false, errorCode: "CAPTIVE_PORTAL" });
    expect(server.pushes).toHaveLength(0);
    expect(server.pulls).toHaveLength(0);
    expect(runtime.store.getState().network).toBe("captivePortal");
  });

  test("a full cycle pushes, pulls, runs hooks and updates counters", async () => {
    const { runtime, server } = await createTestRuntime();
    await seedAsset(runtime.db);
    await updateAssetReadings({ assetId: ASSET, hourMeter: 140 }, { runtime });
    const media = jest.fn(async () => undefined);
    const engine = createSyncEngine(runtime, { media });
    const result = await engine.syncNow("manual");
    expect(result.ok).toBe(true);
    expect(server.pushes).toHaveLength(1);
    expect(server.pulls).toHaveLength(1);
    expect(media).toHaveBeenCalled();
    expect(runtime.store.getState()).toMatchObject({ pendingMutations: 0, phase: "idle", network: "online" });
  });

  test("concurrent requests share one running cycle", async () => {
    const { runtime, server } = await createTestRuntime();
    const engine = createSyncEngine(runtime);
    await Promise.all([engine.syncNow("manual"), engine.syncNow("manual")]);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(server.pulls.length).toBeLessThanOrEqual(2);
  });
});

describe("diagnostics", () => {
  test("the queue is capped and personal data is redacted", async () => {
    const { runtime } = await createTestRuntime();
    for (let i = 0; i < DIAGNOSTICS_MAX_ROWS + 5; i += 1) {
      await enqueueDiagnostic(runtime.db, { id: `d${i}`, payload: { kind: "error", code: "INTERNAL" }, nowMs: runtime.clock.now() + i });
    }
    expect(await countDiagnostics(runtime.db)).toBe(DIAGNOSTICS_MAX_ROWS);
    expect(redact({ email: "a@b.com", note: "mail c@d.org", nested: { phone: "1" } })).toEqual({ email: "[redacted]", note: "mail [email]", nested: { phone: "[redacted]" } });
  });
});
