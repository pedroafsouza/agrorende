import { readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeClient, collections } from "@agrorende/db";
import { setupTestDb, type TestDbHandle } from "@agrorende/db/testing";

import { notificationSeams } from "../../seams.js";
import { sanitizeCell } from "./csv.js";
import { exportStorageKey } from "./dto.js";
import { EXPORT_HEADERS } from "./headers.js";
import {
  buildExportJob,
  createExportJob,
  downloadExportJob,
  expireExportJobs,
  getExportJob,
  requestExport,
  runQueuedExportJobs,
  type ExportCtx,
  type ExportNotifier,
} from "./service.js";
import { fsExportStore, type ExportStore } from "./storage.js";

const ORG = "0190f5a0-0000-7000-8000-0000000fa001";
const OTHER_ORG = "0190f5a0-0000-7000-8000-0000000fa002";
const ADMIN = "0190f5a0-0000-7000-8000-0000000fb001";
const MANAGER = "0190f5a0-0000-7000-8000-0000000fb002";
const NOW = new Date("2026-10-08T12:00:00.000Z");
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const MEDIA_ROOT = path.resolve(REPO_ROOT, process.env.MEDIA_ROOT ?? ".data/media-t05", "exports-test");

const admin: ExportCtx = { orgId: ORG, userId: ADMIN, role: "ADMIN", locale: "pt-BR" };
const manager: ExportCtx = { orgId: ORG, userId: MANAGER, role: "MANAGER", locale: "en" };

function memoryStore(): ExportStore & { files: Map<string, Uint8Array> } {
  const files = new Map<string, Uint8Array>();
  return {
    files,
    put: async (key, body) => void files.set(key, body),
    get: async (key) => {
      const body = files.get(key);
      if (!body) throw new Error("missing");
      return body;
    },
    delete: async (key) => void files.delete(key),
  };
}

function workOrder(index: number, orgId: string, title: string) {
  return {
    _id: `0190f5a0-0000-7000-8000-${String(index).padStart(6, "0")}${orgId.slice(-6)}`,
    organizationId: orgId,
    syncVersion: 1,
    createdAt: new Date(NOW.getTime() - (100 - index) * 60_000),
    updatedAt: NOW,
    deletedAt: null,
    number: `OS-${String(index).padStart(6, "0")}`,
    type: "CORRECTIVE",
    status: "COMPLETED",
    priority: "HIGH",
    title,
    completedAt: new Date("2026-10-07T13:30:00.000Z"),
    laborCostCents: 1234,
    partsCostCents: 100,
    externalCostCents: 0,
  } as never;
}

async function collect(chunks: AsyncIterable<string>): Promise<string> {
  let out = "";
  for await (const chunk of chunks) out += chunk;
  return out;
}

let handle: TestDbHandle;

describe("exports module", () => {
  beforeAll(async () => {
    process.env.MONGODB_URI ??= "mongodb://localhost:27017/?directConnection=true";
    handle = await setupTestDb("agrorende_t05_exports");
  });

  afterAll(async () => {
    await handle.drop();
    await closeClient();
    await rm(MEDIA_ROOT, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await handle.truncate();
    await collections.organizations(handle.db).insertOne({ _id: ORG, timezone: "America/Sao_Paulo", name: "Org" } as never);
    await collections.workOrders(handle.db).insertMany([
      workOrder(1, ORG, "Troca de óleo; filtro"),
      workOrder(2, ORG, "=HYPERLINK(\"http://evil\")"),
      workOrder(3, ORG, "@SUM(A1)"),
      workOrder(4, OTHER_ORG, "Other tenant"),
    ]);
  });

  it("streams small exports with BOM, semicolons, localized headers, sanitized formulas and tenant filter", async () => {
    const result = await requestExport(admin, "work-orders", {}, { db: handle.db, now: NOW });
    expect(result.kind).toBe("stream");
    if (result.kind !== "stream") return;
    expect(result.fileName).toBe("agrorende-work-orders-2026-10-08.csv");
    const csv = await collect(result.chunks);
    expect(csv.startsWith("\uFEFFNúmero;Título;Tipo;")).toBe(true);
    const lines = csv.slice(1).trimEnd().split("\r\n");
    expect(lines).toHaveLength(4);
    expect(csv).not.toContain("Other tenant");
    expect(lines[1]).toContain('"Troca de óleo; filtro"');
    expect(lines[2]).toContain(`"'=HYPERLINK(""http://evil"")"`);
    expect(lines[3]).toContain("'@SUM(A1)");
    expect(lines[1]).toContain("2026-10-07 10:30:00");
    expect(lines[1]).toContain(";12,34;1,00;0,00");
  });

  it("uses English headers and decimal points for the en locale and applies filters", async () => {
    const result = await requestExport(manager, "costs", { from: "2026-10-07T00:00:00.000Z", to: "2026-10-08T00:00:00.000Z" }, { db: handle.db, now: NOW });
    if (result.kind !== "stream") throw new Error("expected stream");
    const csv = await collect(result.chunks);
    expect(csv).toContain("Number;Completed at;Machine ID;Customer ID;Assignee ID;Labour (BRL);Parts (BRL);External services (BRL);Total cost (BRL)");
    expect(csv).toContain(";12.34;1.00;0.00;13.34");
    const none = await requestExport(manager, "costs", { from: "2026-10-08T00:00:00.000Z" }, { db: handle.db, now: NOW });
    if (none.kind !== "stream") throw new Error("expected stream");
    expect((await collect(none.chunks)).trimEnd().split("\r\n")).toHaveLength(1);
  });

  it("restricts location-pings to ADMIN and rejects bad input", async () => {
    await expect(requestExport(manager, "location-pings", {}, { db: handle.db })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(requestExport(admin, "location-pings", {}, { db: handle.db })).resolves.toMatchObject({ kind: "stream" });
    await expect(requestExport(admin, "secrets", {}, { db: handle.db })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(requestExport(admin, "assets", { from: "yesterday" }, { db: handle.db })).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(requestExport(admin, "assets", { organizationId: OTHER_ORG }, { db: handle.db })).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    await expect(requestExport({ ...admin, role: "FIELD" }, "assets", {}, { db: handle.db })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("queues one job above the stream limit, builds once, stores a 7-day download and notifies once", async () => {
    const store = memoryStore();
    const notify = vi.fn<ExportNotifier>(async () => undefined);
    const enqueue = vi.fn(async () => undefined);
    const deps = { db: handle.db, now: NOW, store, notify, enqueue, streamLimit: 2 };

    const first = await requestExport(admin, "work-orders", {}, deps);
    const second = await requestExport(admin, "work-orders", {}, deps);
    expect(first.kind).toBe("job");
    if (first.kind !== "job" || second.kind !== "job") return;
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.job.id).toBe(first.job.id);
    expect(first.job.status).toBe("QUEUED");
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(await collections.exportJobs(handle.db).countDocuments({})).toBe(1);

    const builds = await Promise.all([buildExportJob(first.job.id, deps), buildExportJob(first.job.id, deps)]);
    expect(builds.filter((build) => build.built)).toHaveLength(1);
    expect(await buildExportJob(first.job.id, deps)).toEqual({ built: false });
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith({ orgId: ORG, userId: ADMIN, jobId: first.job.id, entity: "work-orders", rowCount: 3 });

    const csv = new TextDecoder("utf-8", { ignoreBOM: true }).decode(store.files.get(exportStorageKey(ORG, first.job.id)));
    expect(csv.startsWith("\uFEFFNúmero;")).toBe(true);
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).not.toContain("Other tenant");

    const ready = await getExportJob(admin, first.job.id, deps);
    expect(ready).toMatchObject({ status: "READY", rowCount: 3, expiresAt: "2026-10-15T12:00:00.000Z" });
    expect(ready.downloadUrl).toContain(first.job.id);
    const download = await downloadExportJob(admin, first.job.id, deps);
    expect(new TextDecoder("utf-8", { ignoreBOM: true }).decode(download.body)).toBe(csv);

    const later = { ...deps, now: new Date("2026-10-16T12:00:00.000Z") };
    expect((await getExportJob(admin, first.job.id, later)).status).toBe("EXPIRED");
    await expect(downloadExportJob(admin, first.job.id, later)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await expireExportJobs(later)).toBe(1);
    expect(await expireExportJobs(later)).toBe(0);
    expect(store.files.size).toBe(0);
  });

  it("hides jobs from other tenants and other managers", async () => {
    const deps = { db: handle.db, now: NOW, store: memoryStore(), notify: async () => undefined };
    const { job } = await createExportJob(admin, { entity: "assets" }, deps);
    await expect(getExportJob({ ...admin, orgId: OTHER_ORG }, job.id, deps)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(getExportJob(manager, job.id, deps)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(createExportJob(manager, { entity: "location-pings" }, deps)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("worker poller builds queued jobs through the filesystem store and survives a failing notifier", async () => {
    const store = fsExportStore(MEDIA_ROOT);
    const deps = {
      db: handle.db,
      now: NOW,
      store,
      notify: async () => {
        throw new Error("push down");
      },
    };
    const { job } = await createExportJob(manager, { entity: "work-orders", filters: {} }, deps);
    const results = await runQueuedExportJobs(deps);
    expect(results).toEqual([{ built: true, status: "READY", rowCount: 3, notified: false }]);
    expect(await runQueuedExportJobs(deps)).toEqual([]);
    const files = await readdir(path.join(MEDIA_ROOT, "exports", ORG));
    expect(files).toEqual([`${job.id}.csv`]);
    const body = new TextDecoder("utf-8", { ignoreBOM: true }).decode((await downloadExportJob(manager, job.id, deps)).body);
    expect(body.startsWith("\uFEFFNumber;Title;")).toBe(true);
  });

  it("reclaims an abandoned RUNNING job and marks broken jobs FAILED", async () => {
    const deps = { db: handle.db, now: NOW, store: memoryStore(), notify: async () => undefined };
    const { job } = await createExportJob(admin, { entity: "assets" }, deps);
    await collections.exportJobs(handle.db).updateOne({ _id: job.id }, { $set: { status: "RUNNING", startedAt: new Date(NOW.getTime() - 3_600_000) } });
    expect((await buildExportJob(job.id, deps)).status).toBe("READY");

    const broken = await createExportJob(admin, { entity: "rentals" }, deps);
    await collections.exportJobs(handle.db).updateOne({ _id: broken.job.id }, { $set: { entity: "nope" } });
    expect(await buildExportJob(broken.job.id, deps)).toEqual({ built: true, status: "FAILED" });
    expect((await getExportJob(admin, broken.job.id, deps)).errorCode).toBe("INTERNAL");
  });

  it("sends EXPORT_READY once through the notifications seam inside a sync transaction", async () => {
    const spy = vi.spyOn(notificationSeams, "create");
    await collections.syncCounters(handle.db).updateOne({ _id: ORG }, { $setOnInsert: { value: 0, horizonVersion: 0 } }, { upsert: true });
    await collections.users(handle.db).insertOne({
      _id: ADMIN,
      organizationId: ORG,
      syncVersion: 1,
      createdAt: NOW,
      updatedAt: NOW,
      deletedAt: null,
      name: "Alice",
      role: "ADMIN",
      locale: "pt-BR",
      isActive: true,
    } as never);
    const deps = { db: handle.db, now: NOW, store: memoryStore() };
    const { job } = await createExportJob(admin, { entity: "assets" }, deps);
    expect((await buildExportJob(job.id, deps)).notified).toBe(true);
    expect((await buildExportJob(job.id, deps)).built).toBe(false);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]?.[1]).toEqual({
      type: "EXPORT_READY",
      userIds: [ADMIN],
      entity: { entityType: "EXPORT_JOB", entityId: job.id },
      params: { entity: "assets", rowCount: expect.any(Number) as number },
    });
    const rows = await collections.notifications(handle.db).find({ organizationId: ORG, type: "EXPORT_READY" }).toArray();
    expect(rows.map((row) => [row.userId, row.entityId])).toEqual([[ADMIN, job.id]]);
    expect(await collections.eventOutbox(handle.db).countDocuments({ organizationId: ORG, type: "notification:new" })).toBe(1);
    spy.mockRestore();
  });
});

describe("EXPORT_HEADERS", () => {
  it("labels every column in pt-BR and en", () => {
    for (const label of Object.values(EXPORT_HEADERS)) {
      expect(label["pt-BR"].length).toBeGreaterThan(0);
      expect(label.en.length).toBeGreaterThan(0);
    }
  });
});

describe("sanitizeCell", () => {
  it("prefixes formula triggers only", () => {
    expect(["=1", "+1", "-1", "@a", "\tx", "ok", "1-2"].map(sanitizeCell)).toEqual(["'=1", "'+1", "'-1", "'@a", "'\tx", "ok", "1-2"]);
  });
});

