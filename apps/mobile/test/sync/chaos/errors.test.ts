import { randomBytes } from "node:crypto";

import type { AppErrorCode } from "@agrorende/contracts/errors";
import { uuidv7 } from "uuidv7";
import { describe, expect, it } from "vitest";

import { mutationRegistry } from "../../../../../packages/core/src/sync/registry";
import { persistCapture, VIDEO_MAX_MS } from "../../../src/media/capture";
import { canCapture } from "../../../src/media/storage";
import { allowMobileDataOnce, discardMediaFile } from "../../../src/media/queue";
import { maintainLocationBuffer } from "../../../src/location/buffer";
import { syncAttention, type AttentionInput } from "../../../src/sync/attention";
import { listConflicts } from "../../../src/sync/conflicts";
import { collectPendingWork } from "../../../src/sync/handoff";
import { transitionWorkOrder } from "../../../src/sync/mutators/jobs";
import { deleteMedia, registerMedia } from "../../../src/sync/mutators/media";
import { readSyncState, SYNC_STATE_KEYS } from "../../../src/sync/state";
import { expectCatalog, localCode } from "./catalog";
import type { ChaosDevice } from "./device";
import { jpegBytes } from "./files";
import { BASE, countRequests, SEED } from "./harness";
import { createAssignedJob } from "./office";
import { capture, createOfflineReport, DAY_MS, HOUR_MS, MIB, PHOTO, VIDEO } from "./scenario";
import { useChaosSuite } from "./suite";

const suite = useChaosSuite();

async function attentionCodes(device: ChaosDevice, extra: Partial<AttentionInput> = {}): Promise<AppErrorCode[]> {
  const items = await syncAttention(device.sqlDb, { nowMs: device.clock.now(), snapshot: device.store.getState(), wifi: device.files.wifi, ...extra });
  return items.map((item) => item.code);
}

interface MediaFileState {
  readonly state: string;
  readonly attempts: number;
  readonly bytesSent: number;
  readonly localUri: string;
  readonly thumbUri: string | null;
  readonly sizeBytes: number;
  readonly uploadId: string | null;
  readonly progress: { error?: string; thumb?: boolean; parts?: { n: number; etag: string }[] };
}

async function mediaFile(device: ChaosDevice, mediaId: string): Promise<MediaFileState> {
  const row = await device.sqlDb.get<Omit<MediaFileState, "progress"> & { partsDone: string | null }>(
    "SELECT state, attempts, bytesSent, localUri, thumbUri, sizeBytes, uploadId, partsDone FROM media_files WHERE mediaId = ?",
    [mediaId],
  );
  if (row === undefined) throw new Error(`no media_files row ${mediaId}`);
  return { ...row, progress: JSON.parse(row.partsDone ?? "{}") as MediaFileState["progress"] };
}

async function serverReport(id: string) {
  return suite.server().seeded.raw("field_reports").findOne({ _id: id });
}

async function serverMedia(id: string) {
  return suite.server().seeded.raw("media").findOne({ _id: id });
}

function mediaRoute(mediaId: string, rest: string): RegExp {
  return new RegExp(`^${rest.split(" ")[0]} /media/${mediaId}/${rest.split(" ")[1]}$`);
}

describe("EC-SYN-01…35 through the real engine and handlers", () => {
  it("EC-SYN-01 OUTBOX_BACKLOG: 500 waiting actions or 5 GB of pending media raise the backlog card without blocking new work", async () => {
    expectCatalog("OUTBOX_BACKLOG", "EC-SYN-01");
    const device = await suite.device("syn01");
    device.online = false;
    await createOfflineReport(device, [], "Backlog 0");
    expect(await attentionCodes(device)).not.toContain("OUTBOX_BACKLOG");
    // Clone the queued command into 499 more (distinct ids) — the card is a local count only.
    for (let i = 0; i < 499; i += 1) {
      await device.sqlDb.run(
        "INSERT INTO outbox (id, name, entityType, entityId, payload, occurredAt, lat, lng, status, attempts, createdAt) SELECT ?, name, entityType, ?, payload, occurredAt, lat, lng, 'PENDING', 0, createdAt FROM outbox ORDER BY seq LIMIT 1",
        [uuidv7(), uuidv7()],
      );
    }
    const items = await syncAttention(device.sqlDb, { nowMs: device.clock.now() });
    expect(items.find((item) => item.code === "OUTBOX_BACKLOG")?.count).toBe(500);
    // The user can still create work while the backlog card shows.
    await createOfflineReport(device, [], "Backlog novo");
    expect(await device.count("SELECT COUNT(*) AS n FROM outbox")).toBe(501);
  });

  it("EC-SYN-02 OUTBOX_ITEM_STUCK: a permanently retrying first command makes later rows wait, keeps its mutation id and is flagged after 24 h", async () => {
    expectCatalog("OUTBOX_ITEM_STUCK", "EC-SYN-02");
    const device = await suite.device("syn02");
    const server = suite.server();
    device.online = false;
    const first = await createOfflineReport(device, [], "Preso");
    const later = await createOfflineReport(device, [], "Depois");
    const firstId = (await device.sqlDb.get<{ id: string }>("SELECT id FROM outbox ORDER BY seq LIMIT 1"))?.id;
    device.online = true;
    const original = mutationRegistry["fieldReport.create"];
    mutationRegistry["fieldReport.create"] = {
      ...original,
      apply: async (...args: Parameters<typeof original.apply>) => {
        if ((args[2] as { id?: string } | undefined)?.id === first.id || JSON.stringify(args).includes(first.id)) throw new Error("permanent retryable failure");
        return original.apply(...args);
      },
    } as typeof original;
    try {
      for (let i = 0; i < 10; i += 1) {
        await device.sync();
        device.clock.advance(3 * HOUR_MS);
      }
      expect(await serverReport(later.id)).toBeNull();
      const rows = await device.sqlDb.all<{ id: string; entityId: string; attempts: number }>("SELECT id, entityId, attempts FROM outbox ORDER BY seq");
      expect(rows.map((row) => row.entityId)).toEqual([first.id, later.id]);
      expect(rows[0]?.id).toBe(firstId);
      expect(rows[0]?.attempts).toBeGreaterThanOrEqual(9);
      expect(await attentionCodes(device)).toContain("OUTBOX_ITEM_STUCK");
    } finally {
      mutationRegistry["fieldReport.create"] = original;
    }
    // "Retry" sends the same mutation id; nothing is duplicated.
    expect((await device.syncUntilIdle()).ok).toBe(true);
    expect(await server.seeded.raw("processed_mutations").countDocuments({ mutationId: firstId })).toBe(1);
    expect(await server.seeded.raw("field_reports").countDocuments({ _id: { $in: [first.id, later.id] } })).toBe(2);
  });

  it("EC-SYN-03 PUSH_PARTIAL_RETRY: a server failure on command #3 applies #1–#2 and reports the partial send", async () => {
    expectCatalog("PUSH_PARTIAL_RETRY", "EC-SYN-03");
    const device = await suite.device("syn03");
    device.online = false;
    const ids: string[] = [];
    for (let i = 0; i < 4; i += 1) ids.push((await createOfflineReport(device, [], `Parcial ${i}`)).id);
    device.online = true;
    const original = mutationRegistry["fieldReport.create"];
    let calls = 0;
    mutationRegistry["fieldReport.create"] = {
      ...original,
      apply: async (...args: Parameters<typeof original.apply>) => {
        calls += 1;
        if (calls === 3) throw new Error("brief outage");
        return original.apply(...args);
      },
    } as typeof original;
    try {
      const result = await device.sync();
      expect(result.push?.status).toBe("retry");
      expect(device.store.getState().lastError).toBe("PUSH_PARTIAL_RETRY");
      expect(await attentionCodes(device)).toContain("PUSH_PARTIAL_RETRY");
    } finally {
      mutationRegistry["fieldReport.create"] = original;
    }
    expect((await device.syncUntilIdle()).ok).toBe(true);
    expect(device.store.getState().lastError).toBeUndefined();
    expect(await suite.server().seeded.raw("field_reports").countDocuments({ _id: { $in: ids } })).toBe(4);
    expect(await suite.server().seeded.raw("activity_events").countDocuments({ entityId: { $in: ids }, type: "FIELD_REPORT_CREATED" })).toBeLessThanOrEqual(4);
  });

  it("EC-SYN-04 INTERNAL: dropped responses and 500s across sync and media routes cause no duplicates and never block new records", async () => {
    expectCatalog("INTERNAL", "EC-SYN-04");
    const device = await suite.device("syn04");
    const server = suite.server();
    const first = await createOfflineReport(device, [PHOTO], "Instável 1");
    server.inject({ kind: "status", status: 500, body: { error: { code: "INTERNAL", message: "boom" } }, match: /^POST \/sync\/push$/, times: 1 });
    server.inject({ kind: "drop", match: /^POST \/media\/[^/]+\/complete$/, times: 1 });
    server.inject({ kind: "status", status: 500, body: { error: { code: "INTERNAL", message: "boom" } }, match: /^GET \/sync\/pull$/, times: 1 });
    const result = await device.sync();
    expect(result.push?.status).toBe("retry");
    // The user keeps working while the service is unstable.
    const second = await createOfflineReport(device, [PHOTO], "Instável 2");
    server.inject({ kind: "drop", match: /^POST \/sync\/push$/, times: 1 });
    await device.sync();
    expect((await device.syncUntilIdle()).ok).toBe(true);
    for (const report of [first, second]) {
      expect(await server.seeded.raw("field_reports").countDocuments({ _id: report.id })).toBe(1);
      expect((await serverMedia(report.media[0]?.id ?? ""))?.uploadedAt).not.toBeNull();
    }
    expect(await device.count("SELECT COUNT(*) AS n FROM media_files WHERE state <> 'DONE'")).toBe(0);
  });

  it("EC-SYN-05 CAPTIVE_PORTAL: an HTML health answer stops the cycle before any credentialed push and Auto resumes on JSON", async () => {
    expectCatalog("CAPTIVE_PORTAL", "EC-SYN-05");
    const device = await suite.device("syn05");
    const server = suite.server();
    const report = await createOfflineReport(device, [], "Portal");
    server.inject({ kind: "html", match: /^GET \/health$/, times: 1 });
    const pushesBefore = countRequests(server, /^POST \/sync\/push$/, device.deviceId);
    const result = await device.sync();
    expect(result.errorCode).toBe("CAPTIVE_PORTAL");
    expect(device.store.getState().network).toBe("captivePortal");
    expect(countRequests(server, /^POST \/sync\/push$/, device.deviceId)).toBe(pushesBefore);
    expect(await attentionCodes(device)).toContain("CAPTIVE_PORTAL");
    expect((await device.sync()).ok).toBe(true);
    expect(device.store.getState().network).toBe("online");
    expect(await serverReport(report.id)).not.toBeNull();
  });

  it("EC-SYN-06 SLOW_CONNECTION: on a slow link photos and previews finish while the video original waits", async () => {
    expectCatalog("SLOW_CONNECTION", "EC-SYN-06");
    const device = await suite.device("syn06");
    const report = await createOfflineReport(device, [VIDEO, PHOTO, PHOTO], "Lento");
    const [video, ...photos] = report.media;
    device.files.bandwidthBps = 20 * 1024;
    device.store.setState({ slowLink: true });
    await device.sync();
    for (const photo of photos) expect((await mediaFile(device, photo.id)).state).toBe("DONE");
    const waiting = await mediaFile(device, video?.id ?? "");
    expect(waiting.state).toBe("QUEUED");
    expect(waiting.progress.thumb).toBe(true);
    expect(device.store.getState().slowLink).toBe(true);
    expect(await attentionCodes(device)).toContain("SLOW_CONNECTION");
    device.files.bandwidthBps = undefined;
    device.store.setState({ slowLink: false });
    expect((await device.syncUntilIdle()).ok).toBe(true);
    expect((await serverMedia(video?.id ?? ""))?.uploadedAt).not.toBeNull();
  });

  it("EC-SYN-07 RATE_LIMITED: a 429 with Retry-After defers the batch without a rapid retry loop or duplicates", async () => {
    expectCatalog("RATE_LIMITED", "EC-SYN-07");
    const device = await suite.device("syn07");
    const server = suite.server();
    const report = await createOfflineReport(device, [], "Ritmo");
    server.inject({ kind: "status", status: 429, headers: { "retry-after": "120" }, body: { error: { code: "RATE_LIMITED", message: "slow down" } }, match: /^POST \/sync\/push$/, times: 1 });
    const now = device.clock.now();
    expect((await device.sync()).push?.status).toBe("retry");
    const row = await device.sqlDb.get<{ nextAttemptAt: string; lastError: string }>("SELECT nextAttemptAt, lastError FROM outbox");
    expect(row?.lastError).toBe("RATE_LIMITED");
    expect(Date.parse(row?.nextAttemptAt ?? "")).toBeGreaterThanOrEqual(now + 120_000);
    const pushes = countRequests(server, /^POST \/sync\/push$/, device.deviceId);
    for (let i = 0; i < 3; i += 1) await device.sync();
    expect(await device.count("SELECT COUNT(*) AS n FROM outbox WHERE status = 'PENDING'")).toBe(1);
    expect(countRequests(server, /^POST \/sync\/push$/, device.deviceId) - pushes).toBeLessThanOrEqual(3);
    expect(await serverReport(report.id)).toBeNull();
    device.clock.advance(121_000);
    await device.sync();
    expect(await server.seeded.raw("field_reports").countDocuments({ _id: report.id })).toBe(1);
  });

  it("EC-SYN-08 RESET_REQUIRED: a scope reset with pending outbox, media and a draft keeps every queue and resumes the push", async () => {
    expectCatalog("RESET_REQUIRED", "EC-SYN-08");
    const device = await suite.device("syn08");
    const server = suite.server();
    device.online = false;
    const report = await createOfflineReport(device, [PHOTO], "Reset");
    await device.sqlDb.run("INSERT INTO drafts (id, kind, refId, step, payload, updatedAt) VALUES (?, 'FIELD_REPORT', NULL, 'details', ?, ?)", [
      uuidv7(),
      JSON.stringify({ title: "Rascunho" }),
      new Date(device.clock.now()).toISOString(),
    ]);
    await server.seeded.raw("users").updateOne({ _id: SEED.field }, { $inc: { scopeEpoch: 1 } } as never);
    device.online = true;
    // The push is refused once, so the pull runs into the reset while the outbox is still full.
    server.inject({ kind: "status", status: 503, match: /^POST \/sync\/push$/, times: 1 });
    const result = await device.sync();
    expect(result.pull?.resets).toBe(1);
    expect(await device.count("SELECT COUNT(*) AS n FROM outbox WHERE status = 'PENDING'")).toBe(1);
    expect(await device.count("SELECT COUNT(*) AS n FROM drafts")).toBe(1);
    expect(await device.count("SELECT COUNT(*) AS n FROM field_reports WHERE id = ?", [report.id])).toBe(1);
    expect(await device.count("SELECT COUNT(*) AS n FROM media_files WHERE mediaId = ?", [report.media[0]?.id ?? ""])).toBe(1);
    const user = await server.seeded.raw("users").findOne({ _id: SEED.field });
    expect(Number(await readSyncState(device.sqlDb, SYNC_STATE_KEYS.scopeEpoch))).toBe(user?.scopeEpoch);
    expect((await device.syncUntilIdle()).ok).toBe(true);
    expect(await server.seeded.raw("field_reports").countDocuments({ _id: report.id })).toBe(1);
    expect(await device.count("SELECT COUNT(*) AS n FROM drafts")).toBe(1);
  });

  it("EC-SYN-09 VALIDATION_FAILED: an old payload is refused, kept for review and never applied", async () => {
    expectCatalog("VALIDATION_FAILED", "EC-SYN-09");
    const device = await suite.device("syn09");
    device.online = false;
    const report = await createOfflineReport(device, [], "Formato antigo");
    // A payload written by an older app version: a field renamed since then.
    const row = await device.sqlDb.get<{ payload: string }>("SELECT payload FROM outbox");
    const payload = JSON.parse(row?.payload ?? "{}") as Record<string, unknown>;
    payload.category = "HIDRAULICO";
    await device.sqlDb.run("UPDATE outbox SET payload = ?", [JSON.stringify(payload)]);
    device.online = true;
    await device.sync();
    const conflicts = await listConflicts(device.sqlDb);
    const conflict = conflicts.find((item) => item.entityId === report.id);
    expect(conflict?.code).toBe("VALIDATION_FAILED");
    expect(await serverReport(report.id)).toBeNull();
    const handoff = await collectPendingWork(device.sqlDb, { userId: SEED.field, nowIso: new Date().toISOString() });
    expect(JSON.stringify(handoff.conflicts)).toContain("HIDRAULICO");
  });

  it("EC-SYN-10 PULL_FAILED: a failed pull page keeps the cursor and the last-known data timestamp", async () => {
    expectCatalog("PULL_FAILED", "EC-SYN-10");
    const device = await suite.device("syn10");
    const server = suite.server();
    const cursor = await readSyncState(device.sqlDb, SYNC_STATE_KEYS.cursor);
    const lastSyncAt = device.store.getState().lastSyncAt;
    expect(lastSyncAt).toBeDefined();
    await createAssignedJob(server, "Puxar depois");
    server.inject({ kind: "status", status: 500, body: { error: { code: "INTERNAL", message: "pull broke" } }, match: /^GET \/sync\/pull$/, times: 1 });
    const result = await device.sync();
    expect(result.errorCode).toBe("PULL_FAILED");
    expect(await readSyncState(device.sqlDb, SYNC_STATE_KEYS.cursor)).toBe(cursor);
    expect(device.store.getState().lastSyncAt).toBe(lastSyncAt);
    expect(await attentionCodes(device)).toContain("PULL_FAILED");
    expect((await device.sync()).ok).toBe(true);
    expect(await readSyncState(device.sqlDb, SYNC_STATE_KEYS.cursor)).not.toBe(cursor);
  });

  it("EC-SYN-11 FIRST_SYNC_LARGE: an interrupted first download resumes without duplicate rows", async () => {
    expectCatalog("FIRST_SYNC_LARGE", "EC-SYN-11");
    const server = suite.server();
    const device = suite.bare("syn11");
    await device.login();
    expect(await attentionCodes(device, { firstSyncRows: 6_000 })).toContain("FIRST_SYNC_LARGE");
    server.inject({ kind: "network", match: /^GET \/sync\/pull$/, times: 1 });
    expect((await device.sync()).ok).toBe(false);
    expect(device.store.getState().firstSyncDone).toBe(false);
    expect((await device.sync()).ok).toBe(true);
    expect(device.store.getState().firstSyncDone).toBe(true);
    expect(await attentionCodes(device, { firstSyncRows: 6_000 })).not.toContain("FIRST_SYNC_LARGE");
    const local = await device.count("SELECT COUNT(*) AS n FROM work_orders");
    const distinct = await device.count("SELECT COUNT(DISTINCT id) AS n FROM work_orders");
    expect(local).toBe(distinct);
    expect(local).toBeGreaterThan(0);
  });

  // EC-SYN-12 and EC-SYN-13 live in idempotency.test.ts (they need a file-level DB).

  it("EC-SYN-14 MEDIA_CAPTURE_FAILED: a camera URI with no file is refused and leaves no orphan row", async () => {
    expectCatalog("MEDIA_CAPTURE_FAILED", "EC-SYN-14");
    const device = await suite.device("syn14");
    const id = uuidv7();
    const meta = { id, kind: "PHOTO", tag: "GENERAL", mimeType: "image/jpeg", capturedAt: new Date().toISOString(), parent: { type: "FIELD_REPORT", id: uuidv7() } } as const;
    expect(await localCode(persistCapture(device.sqlDb, device.files, { meta, sourceUri: "file:///cache/never-written.jpg" }))).toBe("MEDIA_CAPTURE_FAILED");
    device.files.add("file:///cache/empty.jpg", new Uint8Array(0));
    expect(await localCode(persistCapture(device.sqlDb, device.files, { meta, sourceUri: "file:///cache/empty.jpg" }))).toBe("MEDIA_CAPTURE_FAILED");
    expect(await device.count("SELECT COUNT(*) AS n FROM media_files WHERE mediaId = ?", [id])).toBe(0);
  });

  it("EC-SYN-15 MEDIA_DEVICE_STORAGE_LOW: low storage blocks capture with the catalog code and keeps the draft", async () => {
    expectCatalog("MEDIA_DEVICE_STORAGE_LOW", "EC-SYN-15");
    const device = await suite.device("syn15");
    device.files.free = 500 * MIB;
    expect(canCapture("PHOTO", device.files.free)).toBe(true);
    expect(await localCode(capture(device, { type: "FIELD_REPORT", id: uuidv7() }, VIDEO))).toBe("MEDIA_DEVICE_STORAGE_LOW");
    device.files.free = 100 * MIB;
    expect(await localCode(capture(device, { type: "FIELD_REPORT", id: uuidv7() }, PHOTO))).toBe("MEDIA_DEVICE_STORAGE_LOW");
    expect(await device.count("SELECT COUNT(*) AS n FROM media_files")).toBe(0);
  });

  it("EC-SYN-16 VIDEO_TOO_LONG: a 61 s video is refused before it is queued", async () => {
    expectCatalog("VIDEO_TOO_LONG", "EC-SYN-16");
    const device = await suite.device("syn16");
    expect(VIDEO_MAX_MS).toBe(60_000);
    expect(await localCode(capture(device, { type: "FIELD_REPORT", id: uuidv7() }, { kind: "VIDEO", durationMs: 61_000 }))).toBe("VIDEO_TOO_LONG");
    expect(await device.count("SELECT COUNT(*) AS n FROM media_files")).toBe(0);
    await capture(device, { type: "FIELD_REPORT", id: uuidv7() }, { kind: "VIDEO", durationMs: 60_000 });
    expect(await device.count("SELECT COUNT(*) AS n FROM media_files")).toBe(1);
  });

  it("EC-SYN-17 LOCAL_MEDIA_MISSING: a queued file deleted after the parent applied asks for a replacement and keeps the report", async () => {
    expectCatalog("LOCAL_MEDIA_MISSING", "EC-SYN-17");
    const device = await suite.device("syn17");
    device.online = false;
    const report = await createOfflineReport(device, [PHOTO, PHOTO], "Arquivo sumiu");
    const [gone, kept] = report.media;
    await device.files.remove((await mediaFile(device, gone?.id ?? "")).localUri);
    device.online = true;
    await device.syncUntilIdle(3);
    const row = await mediaFile(device, gone?.id ?? "");
    expect(row.state).toBe("FAILED");
    expect(row.progress.error).toBe("LOCAL_MEDIA_MISSING");
    expect((await mediaFile(device, kept?.id ?? "")).state).toBe("DONE");
    expect(await serverReport(report.id)).not.toBeNull();
    expect(await attentionCodes(device)).toContain("LOCAL_MEDIA_MISSING");
    // Replacement flow: discard the lost file, attach a new one.
    await discardMediaFile(device.sqlDb, device.files, gone?.id ?? "");
    expect(await device.count("SELECT COUNT(*) AS n FROM media_files WHERE mediaId = ?", [gone?.id ?? ""])).toBe(0);
    expect(await serverReport(report.id)).not.toBeNull();
  });

  it("EC-SYN-18 LOCAL_MEDIA_CORRUPT: zero-byte and changed files stop for the user without touching the parent or the other attachments", async () => {
    expectCatalog("LOCAL_MEDIA_CORRUPT", "EC-SYN-18");
    const device = await suite.device("syn18");
    device.online = false;
    const report = await createOfflineReport(device, [PHOTO, PHOTO, PHOTO], "Arquivo estragado");
    const [empty, changed, fine] = report.media;
    device.files.corrupt((await mediaFile(device, empty?.id ?? "")).localUri, new Uint8Array(0));
    device.files.corrupt((await mediaFile(device, changed?.id ?? "")).localUri, jpegBytes(777, 3));
    device.online = true;
    await device.syncUntilIdle(3);
    for (const media of [empty, changed]) {
      const row = await mediaFile(device, media?.id ?? "");
      expect(row.state).toBe("FAILED");
      expect(row.progress.error).toBe("LOCAL_MEDIA_CORRUPT");
      expect(await device.files.exists(row.localUri)).toBe(true);
    }
    expect((await mediaFile(device, fine?.id ?? "")).state).toBe("DONE");
    expect(await serverReport(report.id)).not.toBeNull();
    expect((await syncAttention(device.sqlDb, { nowMs: device.clock.now() })).find((item) => item.code === "LOCAL_MEDIA_CORRUPT")?.count).toBe(2);
  });

  it("EC-SYN-19 UPLOAD_INTERRUPTED: a transfer cut mid-way keeps its parts and resumes from the next one", async () => {
    expectCatalog("UPLOAD_INTERRUPTED", "EC-SYN-19");
    const device = await suite.device("syn19");
    const server = suite.server();
    const report = await createOfflineReport(device, [{ kind: "VIDEO", sizeBytes: 20 * 1000 * 1000 }], "Interrompido");
    const mediaId = report.media[0]?.id ?? "";
    server.inject({ kind: "network", match: mediaRoute(mediaId, "PUT blob/parts/2"), times: 1 });
    await device.sync();
    const row = await mediaFile(device, mediaId);
    expect(row.state).toBe("QUEUED");
    expect(row.bytesSent).toBeGreaterThan(0);
    expect(row.progress.parts?.map((part) => part.n)).toEqual([1]);
    expect(await attentionCodes(device)).toContain("UPLOAD_INTERRUPTED");
    expect((await device.syncUntilIdle()).ok).toBe(true);
    expect(countRequests(server, mediaRoute(mediaId, "PUT blob/parts/1"))).toBe(1);
    expect((await serverMedia(mediaId))?.uploadedAt).not.toBeNull();
  });

  it("EC-SYN-20 UPLOAD_URL_EXPIRED: an S3 '403 Request has expired' maps to UPLOAD_URL_EXPIRED and a fresh URL is fetched without user action", async () => {
    expectCatalog("UPLOAD_URL_EXPIRED", "EC-SYN-20");
    const device = await suite.device("syn20");
    const server = suite.server();
    const report = await createOfflineReport(device, [PHOTO], "Link vencido");
    const mediaId = report.media[0]?.id ?? "";
    server.inject({
      kind: "status",
      status: 403,
      body: { Code: "AccessDenied", Message: "Request has expired" },
      match: mediaRoute(mediaId, "PUT blob"),
      times: 1,
    });
    await device.sync();
    const row = await mediaFile(device, mediaId);
    expect(row.state).toBe("QUEUED");
    expect(row.progress.error).toBe("UPLOAD_URL_EXPIRED");
    expect((await device.syncUntilIdle()).ok).toBe(true);
    expect(countRequests(server, mediaRoute(mediaId, "POST upload-url"))).toBeGreaterThanOrEqual(3);
    expect((await serverMedia(mediaId))?.uploadedAt).not.toBeNull();
  });

  it("EC-SYN-21 MEDIA_TOO_LARGE: an oversized video stops for replacement and the report stays", async () => {
    expectCatalog("MEDIA_TOO_LARGE", "EC-SYN-21");
    const device = await suite.device("syn21");
    device.online = false;
    const report = await createOfflineReport(device, [VIDEO], "Vídeo enorme");
    const mediaId = report.media[0]?.id ?? "";
    const huge = 10 * 1024 * 1024 * 1024;
    const row = await mediaFile(device, mediaId);
    device.files.addVirtual(row.localUri, huge);
    await device.sqlDb.run("UPDATE media_files SET sizeBytes = ? WHERE mediaId = ?", [huge, mediaId]);
    device.online = true;
    await device.syncUntilIdle(2);
    const failed = await mediaFile(device, mediaId);
    expect(failed.state).toBe("FAILED");
    expect(failed.progress.error).toBe("MEDIA_TOO_LARGE");
    expect(await serverReport(report.id)).not.toBeNull();
    expect(await attentionCodes(device)).toContain("MEDIA_TOO_LARGE");
  });

  it("EC-SYN-22 STORAGE_FULL: server storage full keeps the file queued (never FAILED) and it uploads once space returns", async () => {
    expectCatalog("STORAGE_FULL", "EC-SYN-22");
    const device = await suite.device("syn22");
    const server = suite.server();
    const report = await createOfflineReport(device, [PHOTO], "Disco cheio");
    const mediaId = report.media[0]?.id ?? "";
    server.serverFreeBytes = 0;
    await device.sync();
    const row = await mediaFile(device, mediaId);
    expect(row.state).toBe("QUEUED");
    expect(row.progress.error).toBe("STORAGE_FULL");
    expect(await attentionCodes(device)).toContain("STORAGE_FULL");
    server.serverFreeBytes = 500 * 1024 * 1024 * 1024;
    expect((await device.syncUntilIdle()).ok).toBe(true);
    expect((await mediaFile(device, mediaId)).state).toBe("DONE");
  });

  it("EC-SYN-23 MEDIA_TYPE_MISMATCH: bytes that are not the declared JPEG are refused at completion and the user can replace them", async () => {
    expectCatalog("MEDIA_TYPE_MISMATCH", "EC-SYN-23");
    const device = await suite.device("syn23");
    device.online = false;
    const report = await createOfflineReport(device, [PHOTO, PHOTO], "Formato errado");
    const [bad, good] = report.media;
    const row = await mediaFile(device, bad?.id ?? "");
    device.files.corrupt(row.localUri, Uint8Array.from(randomBytes(row.sizeBytes)));
    device.online = true;
    await device.syncUntilIdle(3);
    const failed = await mediaFile(device, bad?.id ?? "");
    expect(failed.state).toBe("FAILED");
    expect(failed.progress.error).toBe("MEDIA_TYPE_MISMATCH");
    expect((await mediaFile(device, good?.id ?? "")).state).toBe("DONE");
    expect(await serverReport(report.id)).not.toBeNull();
    expect(await attentionCodes(device)).toContain("MEDIA_TYPE_MISMATCH");
  });

  it("EC-SYN-24 MEDIA_PART_MISSING: a completion refused for part 3 re-sends only part 3", async () => {
    expectCatalog("MEDIA_PART_MISSING", "EC-SYN-24");
    const device = await suite.device("syn24");
    const server = suite.server();
    const report = await createOfflineReport(device, [{ kind: "VIDEO", sizeBytes: 20 * 1000 * 1000 }], "Parte faltando");
    const mediaId = report.media[0]?.id ?? "";
    // The poster completes; the original's completion is lost.
    server.inject({ kind: "network", match: mediaRoute(mediaId, "POST complete"), skip: 1, times: 1 });
    await device.sync();
    const row = await mediaFile(device, mediaId);
    expect(row.progress.parts?.map((part) => part.n)).toEqual([1, 2, 3]);
    // The device remembers a wrong ETag for part 3, as if the part never landed.
    const progress = { ...row.progress, parts: row.progress.parts?.map((part) => (part.n === 3 ? { n: 3, etag: "0".repeat(32) } : part)) };
    await device.sqlDb.run("UPDATE media_files SET partsDone = ? WHERE mediaId = ?", [JSON.stringify(progress), mediaId]);
    device.clock.advance(HOUR_MS);
    await device.sync();
    expect(server.log.some((entry) => mediaRoute(mediaId, "POST complete").test(entry.key) && entry.status === 409)).toBe(true);
    expect((await mediaFile(device, mediaId)).progress.parts?.map((part) => part.n)).toEqual([1, 2]);
    expect((await device.syncUntilIdle()).ok).toBe(true);
    expect(countRequests(server, mediaRoute(mediaId, "PUT blob/parts/3"))).toBe(2);
    expect(countRequests(server, mediaRoute(mediaId, "PUT blob/parts/1"))).toBe(1);
    expect((await serverMedia(mediaId))?.uploadedAt).not.toBeNull();
  });

  it("EC-SYN-25 WIFI_ONLY_MEDIA_WAITING: a Wi-Fi-only video waiting 24 h on mobile data prompts and can go once on mobile data", async () => {
    expectCatalog("WIFI_ONLY_MEDIA_WAITING", "EC-SYN-25");
    const device = await suite.device("syn25");
    device.files.wifi = false;
    const report = await createOfflineReport(device, [{ kind: "VIDEO", wifiOnly: true }], "Só Wi-Fi");
    const mediaId = report.media[0]?.id ?? "";
    await device.sync();
    expect((await mediaFile(device, mediaId)).state).toBe("QUEUED");
    expect(await attentionCodes(device)).not.toContain("WIFI_ONLY_MEDIA_WAITING");
    device.clock.advance(25 * HOUR_MS);
    await device.sync();
    expect((await mediaFile(device, mediaId)).state).toBe("QUEUED");
    expect(await attentionCodes(device)).toContain("WIFI_ONLY_MEDIA_WAITING");
    await allowMobileDataOnce(device.sqlDb, mediaId);
    await device.sync();
    expect((await mediaFile(device, mediaId)).state).toBe("DONE");
    expect(await attentionCodes(device)).not.toContain("WIFI_ONLY_MEDIA_WAITING");
  });

  it("EC-SYN-26 THUMBNAIL_FAILED: a missing preview never blocks the original upload", async () => {
    expectCatalog("THUMBNAIL_FAILED", "EC-SYN-26");
    const device = await suite.device("syn26");
    const server = suite.server();
    device.online = false;
    const report = await createOfflineReport(device, [{ kind: "PHOTO", noThumb: true }], "Sem prévia");
    const mediaId = report.media[0]?.id ?? "";
    device.online = true;
    server.inject({ kind: "network", match: mediaRoute(mediaId, "POST upload-url"), times: 1 });
    await device.sync();
    expect((await mediaFile(device, mediaId)).thumbUri).toBeNull();
    expect(await attentionCodes(device)).toContain("THUMBNAIL_FAILED");
    expect((await device.syncUntilIdle()).ok).toBe(true);
    expect((await serverMedia(mediaId))?.uploadedAt).not.toBeNull();
  });

  it("EC-SYN-27 MEDIA_PENDING_STALE: an attachment still pending after 24 h is flagged and stays queued (not FAILED)", async () => {
    expectCatalog("MEDIA_PENDING_STALE", "EC-SYN-27");
    const device = await suite.device("syn27");
    const server = suite.server();
    const report = await createOfflineReport(device, [PHOTO], "Parado");
    const mediaId = report.media[0]?.id ?? "";
    server.inject({ kind: "network", match: mediaRoute(mediaId, "POST upload-url") });
    await device.sync();
    expect(await attentionCodes(device)).not.toContain("MEDIA_PENDING_STALE");
    for (let i = 0; i < 5; i += 1) {
      device.clock.advance(6 * HOUR_MS);
      await device.sync();
    }
    expect(await attentionCodes(device)).toContain("MEDIA_PENDING_STALE");
    expect((await mediaFile(device, mediaId)).state).toBe("QUEUED");
    server.resetFaults();
    device.clock.advance(DAY_MS);
    expect((await device.syncUntilIdle()).ok).toBe(true);
    expect((await mediaFile(device, mediaId)).state).toBe("DONE");
  });

  it("EC-SYN-28 LOCATION_BUFFER_TRIMMED: an over-full buffer is thinned, newer fixes are kept and the trim is reported", async () => {
    expectCatalog("LOCATION_BUFFER_TRIMMED", "EC-SYN-28");
    const device = await suite.device("syn28");
    device.online = false;
    const now = device.clock.now();
    await device.sqlDb.transaction(async (tx) => {
      for (let i = 0; i < 6_000; i += 1) {
        await tx.run("INSERT INTO location_buffer (recordedAt, lat, lng, accuracyM) VALUES (?, ?, ?, 10)", [new Date(now - i * 60_000).toISOString(), -15.79, -47.88]);
      }
    });
    const trimmed = await maintainLocationBuffer(device.sqlDb, now, 3_000);
    expect(trimmed).toBeGreaterThan(0);
    const left = await device.count("SELECT COUNT(*) AS n FROM location_buffer");
    expect(left).toBe(6_000 - trimmed);
    // Every fix of the last 48 h is kept; older ones are thinned to one per 5-minute bucket.
    const recentCutoff = new Date(now - 48 * HOUR_MS).toISOString();
    expect(await device.count("SELECT COUNT(*) AS n FROM location_buffer WHERE recordedAt >= ?", [recentCutoff])).toBe(2_881);
    expect(await device.count("SELECT COUNT(*) AS n FROM location_buffer WHERE recordedAt < ?", [recentCutoff])).toBeLessThanOrEqual(Math.ceil((6_000 - 2_881) / 5) + 1);
    expect(await device.count("SELECT COUNT(*) AS n FROM location_buffer WHERE recordedAt = ?", [new Date(now).toISOString()])).toBe(1);
    expect(await attentionCodes(device, { locationTrimmed: trimmed })).toContain("LOCATION_BUFFER_TRIMMED");
  });

  it("EC-SYN-29 DEVICE_UNSYNCED_STALE: pending work with nothing sent for 24 h is flagged and Sync now clears it", async () => {
    expectCatalog("DEVICE_UNSYNCED_STALE", "EC-SYN-29");
    const device = await suite.device("syn29");
    device.online = false;
    await createOfflineReport(device, [], "Um dia");
    expect(await attentionCodes(device)).not.toContain("DEVICE_UNSYNCED_STALE");
    device.clock.advance(25 * HOUR_MS);
    expect(await attentionCodes(device)).toContain("DEVICE_UNSYNCED_STALE");
    device.online = true;
    expect((await device.syncUntilIdle()).ok).toBe(true);
    expect(await attentionCodes(device)).not.toContain("DEVICE_UNSYNCED_STALE");
  });

  it("EC-SYN-30 UPLOAD_RESUME_AFTER_RESTART: after a kill mid-upload the cold start announces the resume and one media row completes", async () => {
    expectCatalog("UPLOAD_RESUME_AFTER_RESTART", "EC-SYN-30");
    const device = await suite.device("syn30");
    const server = suite.server();
    const report = await createOfflineReport(device, [{ kind: "VIDEO", sizeBytes: 20 * 1000 * 1000 }], "Reinício");
    const mediaId = report.media[0]?.id ?? "";
    server.inject({ kind: "network", match: mediaRoute(mediaId, "PUT blob/parts/3"), times: 1 });
    await device.sync();
    await device.kill();
    await device.restart();
    expect(await attentionCodes(device, { coldStart: true })).toContain("UPLOAD_RESUME_AFTER_RESTART");
    expect((await device.syncUntilIdle()).ok).toBe(true);
    expect(await server.seeded.raw("media").countDocuments({ _id: mediaId })).toBe(1);
    expect(await server.seeded.raw("field_reports").countDocuments({ _id: report.id })).toBe(1);
    expect(await attentionCodes(device, { coldStart: true })).not.toContain("UPLOAD_RESUME_AFTER_RESTART");
  });

  it("EC-SYN-31 SAME_USER_MULTIPLE_DEVICES: two devices of one user drain independently and neither sees the other's queue", async () => {
    expectCatalog("SAME_USER_MULTIPLE_DEVICES", "EC-SYN-31");
    const phone = await suite.device("syn31-phone");
    const tablet = await suite.device("syn31-tablet");
    phone.online = false;
    tablet.online = false;
    const fromPhone = await createOfflineReport(phone, [PHOTO], "Do celular");
    const fromTablet = await createOfflineReport(tablet, [], "Do tablet");
    expect(await phone.count("SELECT COUNT(*) AS n FROM outbox WHERE entityId = ?", [fromTablet.id])).toBe(0);
    expect(await attentionCodes(phone, { otherDevicesWithPending: 1 })).toContain("SAME_USER_MULTIPLE_DEVICES");
    phone.online = true;
    expect((await phone.syncUntilIdle()).ok).toBe(true);
    expect(await serverReport(fromPhone.id)).not.toBeNull();
    expect(await serverReport(fromTablet.id)).toBeNull();
    expect(await tablet.count("SELECT COUNT(*) AS n FROM outbox")).toBe(1);
    tablet.online = true;
    expect((await tablet.syncUntilIdle()).ok).toBe(true);
    expect(await serverReport(fromTablet.id)).not.toBeNull();
  });

  it("EC-SYN-32 MEDIA_LOCKED: deleting a signed attachment is refused, the original stays on the server and in the review list", async () => {
    expectCatalog("MEDIA_LOCKED", "EC-SYN-32");
    const device = await suite.device("syn32");
    device.online = false;
    const report = await createOfflineReport(device, [], "Assinado");
    const signature = await capture(device, { type: "FIELD_REPORT", id: report.id }, PHOTO, "SIGNATURE_CUSTOMER");
    await registerMedia(signature, { runtime: device.rt, lat: -15.79, lng: -47.88 });
    device.online = true;
    expect((await device.syncUntilIdle()).ok).toBe(true);
    expect((await serverMedia(signature.id))?.uploadedAt).not.toBeNull();
    await deleteMedia({ id: signature.id }, { runtime: device.rt, lat: -15.79, lng: -47.88 });
    await device.sync();
    const conflict = (await listConflicts(device.sqlDb)).find((item) => item.entityId === signature.id);
    expect(conflict?.code).toBe("MEDIA_LOCKED");
    expect((await serverMedia(signature.id))?.deletedAt ?? null).toBeNull();
    expect(await device.count("SELECT COUNT(*) AS n FROM media WHERE id = ? AND deletedAt IS NULL", [signature.id])).toBe(1);
    expect(await device.count("SELECT COUNT(*) AS n FROM media_files WHERE mediaId = ?", [signature.id])).toBe(1);
  });

  it("A7 for media: a lost answer after the server stored a file never marks it FAILED", async () => {
    const device = await suite.device("syn32-lost");
    const server = suite.server();
    const report = await createOfflineReport(device, [PHOTO], "Resposta perdida");
    const mediaId = report.media[0]?.id ?? "";
    expect((await device.syncUntilIdle()).ok).toBe(true);
    // A stale queue entry (restored from an old copy) tries to upload the stored variants again.
    await device.sqlDb.run("UPDATE media_files SET state = 'QUEUED', partsDone = NULL, nextAttemptAt = NULL, doneAt = NULL WHERE mediaId = ?", [mediaId]);
    await device.sync();
    expect((await mediaFile(device, mediaId)).state).toBe("DONE");
    expect(server.log.some((entry) => mediaRoute(mediaId, "POST upload-url").test(entry.key) && entry.status === 409)).toBe(true);
  });

  it("EC-SYN-33 MEDIA_NOT_IN_STORAGE: asking for an original that is still sending returns the code and the local preview stays", async () => {
    expectCatalog("MEDIA_NOT_IN_STORAGE", "EC-SYN-33");
    const device = await suite.device("syn33");
    const server = suite.server();
    const report = await createOfflineReport(device, [VIDEO], "Ainda enviando");
    const mediaId = report.media[0]?.id ?? "";
    server.inject({ kind: "network", match: mediaRoute(mediaId, "POST upload-url") });
    await device.sync();
    expect(await serverMedia(mediaId)).not.toBeNull();
    const response = await device.fetch(`${BASE}/api/v1/media/${mediaId}/url?variant=original`, { headers: { authorization: `Bearer ${device.auth.accessToken() ?? ""}` } });
    const body = JSON.parse(await response.text()) as { error?: { code?: string } };
    expect(response.status).toBe(404);
    expect(body.error?.code).toBe("MEDIA_NOT_IN_STORAGE");
    const row = await mediaFile(device, mediaId);
    expect(row.thumbUri).not.toBeNull();
    expect(await device.files.exists(row.localUri)).toBe(true);
  });

  it("EC-SYN-34 INVALID_TRANSITION: a stale workflow step is refused once, nothing is duplicated and the current state is pulled", async () => {
    expectCatalog("INVALID_TRANSITION", "EC-SYN-34");
    const device = await suite.device("syn34");
    const server = suite.server();
    const jobId = await createAssignedJob(server, "Passo velho");
    await device.sync();
    device.online = false;
    await transitionWorkOrder({ id: jobId, action: "accept" }, { runtime: device.rt, lat: -15.79, lng: -47.88 });
    // A second copy of the same step, as a stale screen would send.
    await device.sqlDb.run(
      "INSERT INTO outbox (id, name, entityType, entityId, payload, occurredAt, lat, lng, status, attempts, createdAt) SELECT ?, name, entityType, entityId, payload, occurredAt, lat, lng, 'PENDING', 0, createdAt FROM outbox WHERE entityId = ?",
      [uuidv7(), jobId],
    );
    device.online = true;
    expect((await device.syncUntilIdle()).ok).toBe(true);
    const conflicts = await listConflicts(device.sqlDb);
    expect(conflicts.filter((item) => item.entityId === jobId).map((item) => item.code)).toEqual(["INVALID_TRANSITION"]);
    expect((await server.seeded.raw("work_orders").findOne({ _id: jobId }))?.status).toBe("ACCEPTED");
    expect(await device.count("SELECT COUNT(*) AS n FROM work_orders WHERE id = ? AND status = 'ACCEPTED'", [jobId])).toBe(1);
    expect(await server.seeded.raw("activity_events").countDocuments({ entityId: jobId, type: { $regex: "ACCEPT" } })).toBeLessThanOrEqual(1);
  });

  it("EC-SYN-35 UNKNOWN_MUTATION: a command name the server does not know is kept with its payload for update and diagnostics", async () => {
    expectCatalog("UNKNOWN_MUTATION", "EC-SYN-35");
    const device = await suite.device("syn35");
    device.online = false;
    const report = await createOfflineReport(device, [], "Ação nova");
    await device.sqlDb.run("UPDATE outbox SET name = 'fieldReport.createV9'");
    device.online = true;
    await device.sync();
    const conflict = (await listConflicts(device.sqlDb)).find((item) => item.entityId === report.id);
    expect(conflict?.code).toBe("UNKNOWN_MUTATION");
    expect(await serverReport(report.id)).toBeNull();
    const handoff = await collectPendingWork(device.sqlDb, { userId: SEED.field, nowIso: new Date().toISOString() });
    expect(JSON.stringify(handoff.conflicts)).toContain("Ação nova");
  });
});
