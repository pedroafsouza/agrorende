import { uuidv7 } from "uuidv7";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { mutationRegistry } from "../../../../packages/core/src/sync/registry";
import { loadSyncCenter } from "../../src/features/sync/data";
import { pendingItemCount } from "../../src/features/settings/logic";
import { listConflicts } from "../../src/sync/conflicts";
import { addPart, completeWorkOrder, transitionWorkOrder } from "../../src/sync/mutators/jobs";
import { registerMedia } from "../../src/sync/mutators/media";
import { ChaosDevice } from "./chaos/device";
import { countRequests, SEED, startChaosServer, type ChaosServer } from "./chaos/harness";
import { cancelJob, createAssignedJob } from "./chaos/office";
import { expectCatalog, localCode } from "./chaos/catalog";
import { bundleWithExtraMigration, capture, createOfflineReport, DAY_MS, HOUR_MS, MIB, PHOTO, seedMediaMetadata, VIDEO } from "./chaos/scenario";

let server: ChaosServer;
const devices: ChaosDevice[] = [];

async function newDevice(name: string): Promise<ChaosDevice> {
  server.resetFaults();
  const device = new ChaosDevice(server, `${name}-${devices.length}`);
  devices.push(device);
  await device.login();
  await device.sync();
  return device;
}

beforeAll(async () => {
  server = await startChaosServer();
});

afterEach(async () => {
  server.resetFaults();
  for (const device of devices.splice(0)) await device.destroy();
});

afterAll(async () => {
  await server?.close();
});

async function serverMedia(ids: readonly string[]) {
  return server.seeded.raw("media").find({ _id: { $in: [...ids] } }).toArray();
}

describe("C1–C12 offline chaos scenarios", () => {
  it("C1: report with 6 photos and 1 video survives a kill mid-push and mid-upload", async () => {
    const device = await newDevice("c1");
    device.online = false;
    const report = await createOfflineReport(device, [PHOTO, PHOTO, PHOTO, PHOTO, PHOTO, PHOTO, VIDEO]);
    expect(await device.count("SELECT COUNT(*) AS n FROM media_files WHERE state = 'WAITING_PARENT'")).toBe(7);
    device.online = true;

    server.inject({ kind: "drop", match: /^POST \/sync\/push/, times: 1 });
    const first = await device.sync();
    expect(first.ok).toBe(false);
    await device.kill();
    await device.restart();
    expect(await device.count("SELECT COUNT(*) AS n FROM outbox WHERE status = 'PENDING'")).toBe(1);

    server.inject({ kind: "network", match: /^PUT \/media\/[^/]+\/blob$/, times: 1 });
    await device.sync();
    await device.kill();
    await device.restart();
    const final = await device.syncUntilIdle();
    expect(final.ok).toBe(true);

    expect(await server.seeded.raw("field_reports").countDocuments({ _id: report.id })).toBe(1);
    const media = await serverMedia(report.media.map((m) => m.id));
    expect(media).toHaveLength(7);
    for (const doc of media) expect(doc.uploadedAt).not.toBeNull();
    expect(await device.count("SELECT COUNT(*) AS n FROM media_files WHERE state = 'DONE'")).toBe(7);
    expect(await device.count("SELECT COUNT(*) AS n FROM outbox")).toBe(0);
  });

  it("C2: a push applied on the server whose response is lost is replayed from stored results", async () => {
    const device = await newDevice("c2");
    const report = await createOfflineReport(device, [], "Pneu furado");
    server.inject({ kind: "drop", match: /^POST \/sync\/push/, times: 1 });
    expect((await device.sync()).ok).toBe(false);
    const second = await device.sync();
    expect(second.ok).toBe(true);
    expect(second.push?.applied).toBe(1);
    expect(countRequests(server, /^POST \/sync\/push/, device.deviceId)).toBe(2);
    expect(await server.seeded.raw("field_reports").countDocuments({ _id: report.id })).toBe(1);
    const processed = await server.seeded.raw("processed_mutations").countDocuments({ entityId: report.id });
    expect(processed).toBeLessThanOrEqual(1);
    const local = await device.sqlDb.get<{ number: string | null }>("SELECT number FROM field_reports WHERE id = ?", [report.id]);
    expect(local?.number).not.toBeNull();
  });

  it("C3: a 120 MB video resumes from part 9 of 15 with fresh URLs and matching ETags", async () => {
    const device = await newDevice("c3");
    const report = await createOfflineReport(device, [{ kind: "VIDEO", sizeBytes: 120 * 1000 * 1000 }], "Vídeo do motor");
    const mediaId = report.media[0]?.id ?? "";
    server.inject({ kind: "network", match: new RegExp(`^PUT /media/${mediaId}/blob/parts/9$`), times: 1 });
    await device.sync();
    const row = await device.sqlDb.get<{ state: string; partsDone: string; uploadId: string }>("SELECT state, partsDone, uploadId FROM media_files WHERE mediaId = ?", [mediaId]);
    expect(row?.state).toBe("QUEUED");
    const progress = JSON.parse(row?.partsDone ?? "{}") as { parts?: { n: number }[] };
    expect(progress.parts?.map((p) => p.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);

    await device.kill();
    await device.restart();
    expect((await device.syncUntilIdle()).ok).toBe(true);
    for (let n = 1; n <= 15; n += 1) {
      const puts = countRequests(server, new RegExp(`^PUT /media/${mediaId}/blob/parts/${n}$`));
      expect(puts, `part ${n}`).toBe(n === 9 ? 2 : 1);
    }
    expect(countRequests(server, new RegExp(`^POST /media/${mediaId}/multipart/parts$`))).toBeGreaterThanOrEqual(1);
    const [doc] = await serverMedia([mediaId]);
    expect(doc?.uploadedAt).not.toBeNull();
    expect(doc?.sizeBytes).toBe(120 * 1000 * 1000);
    expect(device.files.partFiles()).toEqual([]);
  });

  it("C4: work completed offline on a job the office cancelled becomes a WO_CANCELLED conflict with late evidence", async () => {
    const device = await newDevice("c4");
    const jobId = await createAssignedJob(server, "Revisar bomba");
    await device.sync();
    expect(await device.count("SELECT COUNT(*) AS n FROM work_orders WHERE id = ?", [jobId])).toBe(1);

    device.online = false;
    await cancelJob(server, jobId);
    const ctx = { runtime: device.rt, lat: -15.79, lng: -47.88 };
    for (const action of ["accept", "startRoute", "arrive", "startWork"] as const) await transitionWorkOrder({ id: jobId, action }, ctx);
    const partId = uuidv7();
    await addPart({ id: partId, workOrderId: jobId, name: "Mangueira 1/2", quantity: 2, unit: "UN" }, ctx);
    const photo = await capture(device, { type: "WORK_ORDER", id: jobId }, PHOTO, "AFTER");
    await registerMedia(photo, ctx);
    await completeWorkOrder({ id: jobId, resolution: "Mangueira trocada", documentLocale: "pt-BR" }, ctx);

    device.online = true;
    await device.syncUntilIdle();

    const conflicts = await listConflicts(device.sqlDb);
    expect(conflicts.some((c) => c.code === "WO_CANCELLED" && c.entityId === jobId)).toBe(true);
    const job = await server.seeded.raw("work_orders").findOne({ _id: jobId });
    expect(job?.status).toBe("CANCELLED");
    expect(job?.hasLateEvidence).toBe(true);
    expect(await server.seeded.raw("work_order_parts").countDocuments({ _id: partId })).toBe(1);
    const [media] = await serverMedia([photo.id]);
    expect(media?.isLateEvidence).toBe(true);
    expect(media?.uploadedAt).not.toBeNull();
    expect(await server.seeded.raw("notifications").countDocuments({ type: "LATE_EVIDENCE", entityId: jobId, userId: SEED.manager })).toBeGreaterThanOrEqual(1);
    expect(await device.count("SELECT COUNT(*) AS n FROM outbox WHERE status = 'PENDING'")).toBe(0);
  });

  it("C5: an access token that expired during 3 days offline is refreshed before the push, with no UI block", async () => {
    const device = await newDevice("c5");
    device.online = false;
    const report = await createOfflineReport(device, [PHOTO], "Correia gasta");
    device.clock.advance(3 * DAY_MS);
    expect(device.authStore.getState().needsReauth).toBe(false);
    device.online = true;
    // The server also sees the old token as expired once (TOKEN_EXPIRED) and the transport refreshes again.
    server.inject({ kind: "status", status: 401, body: { error: { code: "TOKEN_EXPIRED", message: "expired" } }, match: /^POST \/sync\/push/, times: 1, device: device.deviceId });
    const before = server.log.length;
    expect((await device.syncUntilIdle()).ok).toBe(true);
    const keys = server.log.slice(before).filter((entry) => entry.device === device.deviceId).map((entry) => entry.key);
    const firstRefresh = keys.findIndex((key) => key.startsWith("POST /auth/refresh"));
    const firstPush = keys.findIndex((key) => key.startsWith("POST /sync/push"));
    expect(firstRefresh).toBeGreaterThanOrEqual(0);
    expect(firstRefresh).toBeLessThan(firstPush);
    expect(keys.filter((key) => key.startsWith("POST /auth/refresh")).length).toBeGreaterThanOrEqual(2);
    expect(device.authStore.getState().needsReauth).toBe(false);
    expect(device.authStore.getState().status).toBe("signedIn");
    expect(await server.seeded.raw("field_reports").countDocuments({ _id: report.id })).toBe(1);
  });

  it("C6: an expired refresh token with 40 pending items asks to sign in again and the same DB drains after login", async () => {
    const device = await newDevice("c6");
    device.online = false;
    const ids: string[] = [];
    for (let i = 0; i < 40; i += 1) ids.push((await createOfflineReport(device, [], `Item ${i + 1}`)).id);
    device.clock.advance(31 * DAY_MS);
    await server.seeded.raw("refresh_tokens").updateMany({ userId: SEED.field }, { $set: { expiresAt: new Date(Date.now() - DAY_MS) } });
    device.online = true;
    server.inject({ kind: "status", status: 401, body: { error: { code: "TOKEN_EXPIRED", message: "expired" } }, match: /^(POST|GET) \/sync\//, device: device.deviceId });

    const blocked = await device.sync();
    expect(blocked.ok).toBe(false);
    const auth = device.authStore.getState();
    expect(auth.status).toBe("signedIn");
    expect(auth.needsReauth).toBe(true);
    expect(await pendingItemCount(device.sqlDb)).toBe(40);
    expectCatalog("TOKEN_EXPIRED");
    expect(await server.seeded.raw("field_reports").countDocuments({ _id: { $in: ids } })).toBe(0);

    server.resetFaults();
    await device.login(SEED.field);
    expect(await device.count("SELECT COUNT(*) AS n FROM outbox WHERE status = 'PENDING'")).toBe(40);
    expect((await device.syncUntilIdle()).ok).toBe(true);
    expect(device.authStore.getState().needsReauth).toBe(false);
    expect(await server.seeded.raw("field_reports").countDocuments({ _id: { $in: ids } })).toBe(40);
    expect(await pendingItemCount(device.sqlDb)).toBe(0);
  });

  it("C7: on a shared device user B never sees user A's pending data, and A's data syncs when A returns", async () => {
    const device = await newDevice("c7");
    device.online = false;
    const report = await createOfflineReport(device, [PHOTO], "Relatório do usuário A");
    // One queued command; its photo waits for the parent and is counted with it.
    expect(await pendingItemCount(device.sqlDb)).toBe(1);
    expect(await device.count("SELECT COUNT(*) AS n FROM media_files WHERE state = 'WAITING_PARENT'")).toBe(1);
    await device.signOut();
    device.online = true;

    await device.login(SEED.manager);
    await device.syncUntilIdle();
    expect(device.userId).toBe(SEED.manager);
    expect(await device.count("SELECT COUNT(*) AS n FROM field_reports WHERE id = ?", [report.id])).toBe(0);
    expect(await device.count("SELECT COUNT(*) AS n FROM outbox")).toBe(0);
    expect(await device.count("SELECT COUNT(*) AS n FROM media_files")).toBe(0);
    expect(await server.seeded.raw("field_reports").countDocuments({ _id: report.id })).toBe(0);
    await device.signOut();

    await device.login(SEED.field);
    expect(await device.count("SELECT COUNT(*) AS n FROM outbox WHERE entityId = ?", [report.id])).toBe(1);
    expect((await device.syncUntilIdle()).ok).toBe(true);
    const doc = await server.seeded.raw("field_reports").findOne({ _id: report.id });
    expect(doc?.reporterId).toBe(SEED.field);
    const [media] = await serverMedia(report.media.map((m) => m.id));
    expect(media?.uploadedAt).not.toBeNull();
  });

  it("C8: a device clock 3 h ahead is clamped and flagged by the server, and order is preserved", async () => {
    const device = await newDevice("c8");
    device.clock.advance(3 * HOUR_MS);
    device.online = false;
    const ids: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      ids.push((await createOfflineReport(device, [], `Relógio adiantado ${i + 1}`)).id);
      device.clock.advance(60_000);
    }
    device.online = true;
    const sentAt = Date.now();
    expect((await device.syncUntilIdle()).ok).toBe(true);
    const docs = await server.seeded.raw("field_reports").find({ _id: { $in: ids } }).toArray();
    expect(docs).toHaveLength(3);
    const byId = new Map(docs.map((doc) => [doc._id, doc]));
    const ordered = ids.map((id) => byId.get(id));
    for (const doc of ordered) {
      expect((doc?.flags as { clockSkewed?: boolean } | undefined)?.clockSkewed).toBe(true);
      expect((doc?.occurredAt as Date).getTime()).toBeLessThanOrEqual(Date.now() + 1000);
      expect((doc?.occurredAt as Date).getTime()).toBeGreaterThanOrEqual(sentAt - 1000);
    }
    const numbers = ordered.map((doc) => Number(String(doc?.number).replace(/\D/g, "")));
    expect([...numbers].sort((a, b) => a - b)).toEqual(numbers);
  });

  it("C9: 500 pending commands and 10 000 media rows (5 GB) keep local queries under 100 ms and push in ordered batches of 50", async () => {
    const device = await newDevice("c9");
    device.online = false;
    const ids: string[] = [];
    for (let i = 0; i < 500; i += 1) ids.push((await createOfflineReport(device, [], `Fila ${String(i + 1).padStart(3, "0")}`)).id);
    await seedMediaMetadata(device, 10_000, 500_000);
    expect(await device.count("SELECT COUNT(*) AS n FROM media")).toBeGreaterThanOrEqual(10_000);
    expect(await device.count("SELECT SUM(sizeBytes) AS n FROM media_files")).toBeGreaterThanOrEqual(5_000_000_000);

    const timings: Record<string, number> = {};
    // Median of three runs, so a single garbage-collection pause on a shared machine does not fail the budget.
    const time = async (label: string, fn: () => Promise<unknown>) => {
      const runs: number[] = [];
      for (let run = 0; run < 3; run += 1) {
        const started = performance.now();
        await fn();
        runs.push(performance.now() - started);
      }
      timings[label] = runs.sort((a, b) => a - b)[1] ?? Number.POSITIVE_INFINITY;
    };
    await time("syncCenter", () => loadSyncCenter(device.sqlDb));
    await time("pendingItemCount", () => pendingItemCount(device.sqlDb));
    await time("deviceStatus", () => device.sqlDb.all("SELECT state, COUNT(*) AS n, SUM(sizeBytes) AS bytes FROM media_files GROUP BY state"));
    await time("reportList", () => device.sqlDb.all("SELECT id, title, status FROM field_reports WHERE deletedAt IS NULL ORDER BY createdAt DESC LIMIT 50"));
    await time("mediaForParent", () => device.sqlDb.all("SELECT id FROM media WHERE json_extract(parent, '$.id') = ?", [ids[0] ?? ""]));
    for (const [label, ms] of Object.entries(timings)) expect(ms, `${label} took ${ms.toFixed(1)} ms`).toBeLessThan(100);
    console.info(`C9 local query timings (ms): ${JSON.stringify(Object.fromEntries(Object.entries(timings).map(([k, v]) => [k, Number(v.toFixed(1))])))}`);

    device.online = true;
    const before = countRequests(server, /^POST \/sync\/push/, device.deviceId);
    expect((await device.sync()).ok).toBe(true);
    expect(countRequests(server, /^POST \/sync\/push/, device.deviceId) - before).toBe(10);
    const docs = await server.seeded.raw("field_reports").find({ _id: { $in: ids } }).toArray();
    expect(docs).toHaveLength(500);
    const numberOf = new Map(docs.map((doc) => [doc._id, Number(String(doc.number).replace(/\D/g, ""))]));
    const numbers = ids.map((id) => numberOf.get(id) ?? -1);
    expect([...numbers].sort((a, b) => a - b)).toEqual(numbers);
  });

  it("C10: a 500 on mutation #3 applies #1–#2, retries #3+ later in order with no reordering", async () => {
    const device = await newDevice("c10");
    device.online = false;
    const ids: string[] = [];
    for (let i = 0; i < 5; i += 1) ids.push((await createOfflineReport(device, [], `Lote ${i + 1}`)).id);
    device.online = true;

    const original = mutationRegistry["fieldReport.create"];
    let calls = 0;
    mutationRegistry["fieldReport.create"] = {
      ...original,
      apply: async (...args: Parameters<typeof original.apply>) => {
        calls += 1;
        if (calls === 3) throw new Error("database briefly unavailable");
        return original.apply(...args);
      },
    } as typeof original;
    try {
      await device.sync();
      expect(await server.seeded.raw("field_reports").countDocuments({ _id: { $in: ids } })).toBe(2);
      expect(await server.seeded.raw("field_reports").countDocuments({ _id: { $in: ids.slice(0, 2) } })).toBe(2);
      const pending = await device.sqlDb.all("SELECT entityId FROM outbox WHERE status = 'PENDING' ORDER BY seq");
      expect(pending.map((row) => row.entityId)).toEqual(ids.slice(2));
    } finally {
      mutationRegistry["fieldReport.create"] = original;
    }
    expect((await device.syncUntilIdle()).ok).toBe(true);
    const docs = await server.seeded.raw("field_reports").find({ _id: { $in: ids } }).toArray();
    expect(docs).toHaveLength(5);
    const numberOf = new Map(docs.map((doc) => [doc._id, Number(String(doc.number).replace(/\D/g, ""))]));
    const numbers = ids.map((id) => numberOf.get(id) ?? -1);
    expect([...numbers].sort((a, b) => a - b)).toEqual(numbers);
  });

  it("C11: an app update with a new local migration keeps a 30-item outbox and sync continues", async () => {
    const device = await newDevice("c11");
    device.online = false;
    const ids: string[] = [];
    for (let i = 0; i < 30; i += 1) ids.push((await createOfflineReport(device, [], `Antes da atualização ${i + 1}`)).id);
    await device.kill();

    await device.restart({ bundle: bundleWithExtraMigration() });
    expect(await device.count("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'index' AND name = 'chaos_update_idx'")).toBe(1);
    expect(await device.count("SELECT COUNT(*) AS n FROM outbox WHERE status = 'PENDING'")).toBe(30);
    device.online = true;
    expect((await device.syncUntilIdle()).ok).toBe(true);
    expect(await server.seeded.raw("field_reports").countDocuments({ _id: { $in: ids } })).toBe(30);
    expect(await device.count("SELECT COUNT(*) AS n FROM outbox")).toBe(0);
  });

  it("C12: below 1 GB video is blocked, below 200 MB all capture is blocked with an explanation, and DONE media are pruned", async () => {
    const device = await newDevice("c12");
    const report = await createOfflineReport(device, [PHOTO, PHOTO], "Antes de encher");
    expect((await device.syncUntilIdle()).ok).toBe(true);
    expect(await device.count("SELECT COUNT(*) AS n FROM media_files WHERE state = 'DONE'")).toBe(2);
    const parent = { type: "FIELD_REPORT", id: report.id };

    device.files.free = 900 * MIB;
    expect(await localCode(capture(device, parent, VIDEO))).toBe("MEDIA_DEVICE_STORAGE_LOW");
    const photo = await capture(device, parent, PHOTO);
    expect(photo.kind).toBe("PHOTO");

    device.files.free = 150 * MIB;
    expect(await localCode(capture(device, parent, PHOTO))).toBe("MEDIA_DEVICE_STORAGE_LOW");
    expect(await localCode(capture(device, parent, VIDEO))).toBe("MEDIA_DEVICE_STORAGE_LOW");
    expectCatalog("MEDIA_DEVICE_STORAGE_LOW");

    const doneUris = await device.sqlDb.all("SELECT localUri FROM media_files WHERE state = 'DONE'");
    await device.sync();
    expect(await device.count("SELECT COUNT(*) AS n FROM media_files WHERE state = 'DONE'")).toBe(0);
    for (const row of doneUris) expect(await device.files.exists(String(row.localUri))).toBe(false);
    // The waiting photo captured at 900 MB is untouched by pruning.
    expect(await device.count("SELECT COUNT(*) AS n FROM media_files WHERE mediaId = ?", [photo.id])).toBe(1);
  });
});
