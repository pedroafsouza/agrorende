import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closeClient, collections } from "@agrorende/db";
import { setupTestDb, type TestDbHandle } from "@agrorende/db/testing";
import type { LiveOperator } from "@agrorende/contracts/seams";

import { DomainError } from "../../errors";
import {
  getAlerts,
  getKpis,
  getLive,
  getOperatorTrail,
  isOperatorStale,
  isRentalOverdue,
  listActivity,
  listAttention,
  parseAttentionKind,
  resolveAttention,
  slaStateOf,
  startOfZonedDay,
} from "./service";
import { DEFAULT_OPS_SETTINGS } from "./rules";

const ORG = "0190f5a0-0000-7000-8000-0000000c9001";
const OTHER = "0190f5a0-0000-7000-8000-0000000c9002";
const ADMIN = "0190f5a0-0000-7000-8000-0000000c9101";
const MANAGER = "0190f5a0-0000-7000-8000-0000000c9102";
const OPERATOR = "0190f5a0-0000-7000-8000-0000000c9103";
const OTHER_USER = "0190f5a0-0000-7000-8000-0000000c9104";
const DEVICE = "0190f5a0-0000-7000-8000-0000000c9201";
const NOW = new Date("2026-10-08T15:00:00.000Z");
const HOUR = 3_600_000;

let seq = 0;
function uid(): string {
  seq += 1;
  return `0190f5a0-0000-7000-8000-${String(seq).padStart(12, "0")}`;
}

function base(orgId = ORG) {
  return { _id: uid(), organizationId: orgId, syncVersion: 1, createdAt: new Date(NOW.getTime() - 48 * HOUR), updatedAt: NOW, deletedAt: null };
}

function wo(fields: Record<string, unknown>, orgId = ORG) {
  return { ...base(orgId), number: `OS-${String(seq).padStart(6, "0")}`, type: "CORRECTIVE", status: "OPEN", priority: "MEDIUM", title: "Troca", assigneeId: null, ...fields } as never;
}

function rental(fields: Record<string, unknown>, orgId = ORG) {
  return {
    ...base(orgId),
    number: `LOC-${String(seq).padStart(6, "0")}`,
    direction: "OUTBOUND",
    status: "ACTIVE",
    assetId: uid(),
    plannedStart: new Date(NOW.getTime() - 72 * HOUR),
    plannedEnd: new Date(NOW.getTime() + 24 * HOUR),
    ...fields,
  } as never;
}

let handle: TestDbHandle;
const deps = () => ({ db: handle.db, now: NOW, liveSnapshot: async () => [] as LiveOperator[] });

async function seedOrg(): Promise<void> {
  await collections.organizations(handle.db).insertMany([
    { _id: ORG, name: "Org", timezone: "America/Sao_Paulo", settings: {} } as never,
    { _id: OTHER, name: "Other", timezone: "America/Sao_Paulo", settings: {} } as never,
  ]);
  await collections.syncCounters(handle.db).insertMany([{ _id: ORG, value: 0 } as never, { _id: OTHER, value: 0 } as never]);
  await collections.users(handle.db).insertMany([
    { ...base(), _id: ADMIN, name: "Ana Admin", role: "ADMIN", isActive: true, dutyStatus: "OFF_DUTY" } as never,
    { ...base(), _id: MANAGER, name: "Marcos Gerente", role: "MANAGER", isActive: true, dutyStatus: "OFF_DUTY" } as never,
    { ...base(), _id: OPERATOR, name: "Olga Operadora", role: "OPERATOR", isActive: true, dutyStatus: "ON_DUTY" } as never,
    { ...base(OTHER), _id: OTHER_USER, name: "Outro", role: "OPERATOR", isActive: true, dutyStatus: "ON_DUTY" } as never,
  ]);
}

function code(error: unknown): string | undefined {
  return error instanceof DomainError ? error.code : undefined;
}

describe("ops rules", () => {
  it("derives SLA state from the at-risk ratio", () => {
    const due = new Date(NOW.getTime() + 0.5 * HOUR);
    expect(slaStateOf({ status: "OPEN", priority: "CRITICAL", dueAt: due }, DEFAULT_OPS_SETTINGS, NOW)).toBe("AT_RISK");
    expect(slaStateOf({ status: "OPEN", priority: "LOW", dueAt: new Date(NOW.getTime() + 100 * HOUR) }, DEFAULT_OPS_SETTINGS, NOW)).toBe("OK");
    expect(slaStateOf({ status: "OPEN", priority: "LOW", dueAt: new Date(NOW.getTime() - 1) }, DEFAULT_OPS_SETTINGS, NOW)).toBe("BREACHED");
    expect(slaStateOf({ status: "COMPLETED", priority: "LOW", dueAt: new Date(NOW.getTime() - 1) }, DEFAULT_OPS_SETTINGS, NOW)).toBeNull();
  });

  it("applies the rental grace period and the five-minute operator staleness", () => {
    expect(isRentalOverdue({ status: "ACTIVE", plannedEnd: new Date(NOW.getTime() - HOUR) }, 2, NOW)).toBe(false);
    expect(isRentalOverdue({ status: "ACTIVE", plannedEnd: new Date(NOW.getTime() - 3 * HOUR) }, 2, NOW)).toBe(true);
    expect(isOperatorStale(new Date(NOW.getTime() - 6 * 60_000), null, NOW)).toBe(true);
    expect(isOperatorStale(new Date(NOW.getTime() - 6 * 60_000), new Date(NOW.getTime() - 60_000), NOW)).toBe(false);
  });

  it("computes the start of day in the organisation timezone", () => {
    expect(startOfZonedDay(new Date("2026-10-08T02:00:00.000Z"), "America/Sao_Paulo").toISOString()).toBe("2026-10-07T03:00:00.000Z");
    expect(startOfZonedDay(NOW, "America/Sao_Paulo").toISOString()).toBe("2026-10-08T03:00:00.000Z");
  });

  it("parses attention kinds in kebab or enum form", () => {
    expect(parseAttentionKind("rejected-mutation")).toBe("REJECTED_MUTATION");
    expect(parseAttentionKind("STALE_DEVICE")).toBe("STALE_DEVICE");
    expect(() => parseAttentionKind("nope")).toThrow();
  });
});

describe("ops queries", () => {
  beforeAll(async () => {
    process.env.MONGODB_URI ??= "mongodb://localhost:27017/?directConnection=true";
    handle = await setupTestDb("agrorende_t09_ops");
  });

  afterAll(async () => {
    await handle.drop();
    await closeClient();
  });

  beforeEach(async () => {
    await handle.truncate();
    await seedOrg();
  });

  it("raises the four alert types and never leaks another tenant", async () => {
    const reportId = uid();
    await collections.workOrders(handle.db).insertMany([
      wo({ priority: "CRITICAL", dueAt: new Date(NOW.getTime() + 0.5 * HOUR), assigneeId: OPERATOR, status: "ASSIGNED" }),
      wo({ priority: "HIGH", dueAt: new Date(NOW.getTime() - HOUR) }),
      wo({ priority: "LOW", dueAt: new Date(NOW.getTime() + 100 * HOUR) }),
      wo({ priority: "HIGH", dueAt: new Date(NOW.getTime() - HOUR) }, OTHER),
    ]);
    await collections.rentals(handle.db).insertMany([
      rental({ plannedEnd: new Date(NOW.getTime() - 5 * HOUR) }),
      rental({ plannedEnd: new Date(NOW.getTime() - HOUR) }),
      rental({ plannedEnd: new Date(NOW.getTime() - 5 * HOUR) }, OTHER),
    ]);
    await collections.fieldReports(handle.db).insertMany([
      { ...base(), _id: reportId, number: "FR-000001", type: "BREAKDOWN", priority: "CRITICAL", status: "SUBMITTED", title: "Quebra", reporterId: OPERATOR, workOrderId: null } as never,
      { ...base(), number: "FR-000002", type: "BREAKDOWN", priority: "HIGH", status: "SUBMITTED", title: "Normal", reporterId: OPERATOR, workOrderId: null } as never,
    ]);
    await collections.devices(handle.db).insertOne({
      _id: DEVICE,
      organizationId: ORG,
      userId: OPERATOR,
      installationId: "inst",
      platform: "android",
      pendingMutations: 3,
      pendingUploads: 0,
      oldestPendingAt: new Date(NOW.getTime() - 30 * HOUR),
      lastSyncAt: new Date(NOW.getTime() - 30 * HOUR),
      createdAt: NOW,
      updatedAt: NOW,
    } as never);

    const alerts = await getAlerts({ orgId: ORG }, deps());
    const types = alerts.items.map((a) => a.type).sort();
    expect(types).toEqual(["CRITICAL_UNASSIGNED_REPORT", "OVERDUE_RENTAL", "SLA_AT_RISK", "SLA_BREACHED", "STALE_DEVICE"]);
    expect(alerts.items.find((a) => a.type === "CRITICAL_UNASSIGNED_REPORT")?.entityId).toBe(reportId);
    expect(new Set(alerts.items.map((a) => a.id)).size).toBe(alerts.items.length);

    const other = await getAlerts({ orgId: OTHER }, deps());
    expect(other.items.map((a) => a.type).sort()).toEqual(["OVERDUE_RENTAL", "SLA_BREACHED"]);
  });

  it("drops the critical-report alert once its work order is assigned", async () => {
    const woDoc = wo({ assigneeId: OPERATOR, status: "ASSIGNED" }) as unknown as { _id: string };
    await collections.workOrders(handle.db).insertOne(woDoc as never);
    await collections.fieldReports(handle.db).insertOne({
      ...base(),
      number: "FR-000003",
      type: "BREAKDOWN",
      priority: "CRITICAL",
      status: "MARKED_FOR_REPAIR",
      title: "Vazamento",
      reporterId: OPERATOR,
      workOrderId: woDoc._id,
    } as never);
    const alerts = await getAlerts({ orgId: ORG }, deps());
    expect(alerts.items.some((a) => a.type === "CRITICAL_UNASSIGNED_REPORT")).toBe(false);
  });

  it("counts KPIs in the organisation timezone", async () => {
    await collections.workOrders(handle.db).insertMany([
      wo({ status: "OPEN" }),
      wo({ status: "IN_PROGRESS", assigneeId: OPERATOR }),
      wo({ status: "COMPLETED", completedAt: new Date(NOW.getTime() - HOUR), dueAt: NOW, createdAt: new Date(NOW.getTime() - 5 * HOUR) }),
      wo({ status: "VERIFIED", completedAt: new Date(NOW.getTime() - 30 * HOUR), dueAt: new Date(NOW.getTime() - 40 * HOUR), createdAt: new Date(NOW.getTime() - 33 * HOUR) }),
      wo({ status: "OPEN" }, OTHER),
    ]);
    await collections.rentals(handle.db).insertMany([rental({}), rental({ plannedEnd: new Date(NOW.getTime() - 5 * HOUR) })]);
    const kpis = await getKpis({ orgId: ORG }, { range: "7d" }, deps());
    expect(kpis.counts).toMatchObject({
      unassigned_wos: 1,
      in_progress: 1,
      done_today: 1,
      active_rentals: 2,
      overdue_rentals: 1,
      on_duty: 1,
    });
    expect(kpis.slaCompliancePct).toBe(50);
    expect(kpis.mttrHours).toBe(3.5);
    await expect(getKpis({ orgId: ORG }, { range: "1y" }, deps())).rejects.toSatisfy((e) => code(e) === "VALIDATION_FAILED");
  });

  it("merges the live snapshot with devices, active work and stale flags", async () => {
    const working = wo({ status: "IN_PROGRESS", assigneeId: OPERATOR, destLat: -23.5, destLng: -47.4 }) as unknown as { _id: string };
    await collections.workOrders(handle.db).insertOne(working as never);
    await collections.devices(handle.db).insertOne({
      _id: DEVICE,
      organizationId: ORG,
      userId: OPERATOR,
      installationId: "inst",
      platform: "android",
      lastSeenAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
    } as never);
    const live = await getLive(
      { orgId: ORG },
      {
        ...deps(),
        liveSnapshot: async (orgId) => {
          expect(orgId).toBe(ORG);
          return [
            { userId: OPERATOR, name: "Olga", lat: -23.5, lng: -47.4, recordedAt: new Date(NOW.getTime() - 10 * 60_000), dutyStatus: "ON_DUTY", state: "WORKING", lastSeenAt: null },
          ] as LiveOperator[];
        },
      },
    );
    expect(live.operators).toHaveLength(1);
    expect(live.operators[0]).toMatchObject({ userId: OPERATOR, stale: true, deviceId: DEVICE, activeWorkOrderId: working._id });
    expect(live.workOrders.map((w) => w.id)).toEqual([working._id]);
  });

  it("pages the activity feed with an opaque cursor and rejects junk cursors", async () => {
    const events = Array.from({ length: 5 }, (_, i) => ({
      ...base(),
      entityType: "WORK_ORDER",
      entityId: uid(),
      action: "status_changed",
      actorId: ADMIN,
      occurredAt: new Date(NOW.getTime() - i * 60_000),
    }));
    await collections.activityEvents(handle.db).insertMany([...events, { ...events[0], ...base(OTHER), occurredAt: NOW }] as never);
    const first = await listActivity({ orgId: ORG }, { limit: 3 }, deps());
    expect(first.items).toHaveLength(3);
    expect(first.items[0]?.actorName).toBe("Ana Admin");
    const second = await listActivity({ orgId: ORG }, { limit: 3, cursor: first.nextCursor }, deps());
    expect(second.items).toHaveLength(2);
    expect(second.nextCursor).toBeNull();
    await expect(listActivity({ orgId: ORG }, { cursor: "!!" }, deps())).rejects.toSatisfy((e) => code(e) === "VALIDATION_FAILED");
  });

  it("returns an operator trail only inside the tenant", async () => {
    await collections.locationPings(handle.db).insertMany([
      { _id: uid(), organizationId: ORG, userId: OPERATOR, lat: -23.5, lng: -47.4, recordedAt: new Date(NOW.getTime() - 30 * 60_000), receivedAt: NOW, source: "FOREGROUND" } as never,
      { _id: uid(), organizationId: ORG, userId: OPERATOR, lat: -23.6, lng: -47.5, recordedAt: new Date(NOW.getTime() - 3 * HOUR), receivedAt: NOW, source: "FOREGROUND" } as never,
    ]);
    const trail = await getOperatorTrail({ orgId: ORG }, OPERATOR, {}, deps());
    expect(trail.points).toHaveLength(1);
    await expect(getOperatorTrail({ orgId: ORG }, OTHER_USER, {}, deps())).rejects.toSatisfy((e) => code(e) === "NOT_FOUND");
  });
});

describe("needs attention", () => {
  beforeAll(async () => {
    process.env.MONGODB_URI ??= "mongodb://localhost:27017/?directConnection=true";
    handle = await setupTestDb("agrorende_t09_attention");
  });

  afterAll(async () => {
    await handle.drop();
    await closeClient();
  });

  beforeEach(async () => {
    await handle.truncate();
    await seedOrg();
  });

  async function seedRejected(orgId = ORG, userId = OPERATOR): Promise<string> {
    const mutationId = uid();
    await collections.processedMutations(handle.db).insertOne({
      _id: `${orgId}:${mutationId}`,
      organizationId: orgId,
      mutationId,
      userId,
      deviceId: DEVICE,
      name: "workOrder.complete",
      requestHash: "h",
      result: { id: mutationId, status: "REJECTED", code: "GUARD_SIGNATURE_REQUIRED", ref: "OS-000001" },
      resolvedAt: null,
      processedAt: new Date(NOW.getTime() - HOUR),
    } as never);
    return mutationId;
  }

  it("lists rejected mutations, old pending media, stale devices and diagnostics", async () => {
    const mutationId = await seedRejected();
    await seedRejected(OTHER, OTHER_USER);
    await collections.media(handle.db).insertMany([
      { ...base(), createdAt: new Date(NOW.getTime() - 30 * HOUR), kind: "PHOTO", status: "PENDING", capturedById: OPERATOR, capturedAt: NOW, parent: { type: "FIELD_REPORT", id: uid() } } as never,
      { ...base(), createdAt: new Date(NOW.getTime() - HOUR), kind: "PHOTO", status: "PENDING", capturedById: OPERATOR, capturedAt: NOW, parent: { type: "FIELD_REPORT", id: uid() } } as never,
    ]);
    await collections.devices(handle.db).insertOne({
      _id: DEVICE,
      organizationId: ORG,
      userId: OPERATOR,
      installationId: "inst",
      platform: "android",
      pendingMutations: 1,
      pendingUploads: 2,
      oldestPendingAt: new Date(NOW.getTime() - 30 * HOUR),
      lastSyncAt: new Date(NOW.getTime() - 30 * HOUR),
      createdAt: NOW,
      updatedAt: NOW,
    } as never);
    await collections.deviceDiagnostics(handle.db).insertOne({ _id: uid(), organizationId: ORG, deviceId: DEVICE, userId: OPERATOR, createdAt: NOW, payload: {} } as never);

    const list = await listAttention({ orgId: ORG }, deps());
    expect(list.items.map((i) => i.kind).sort()).toEqual(["DIAGNOSTIC", "MEDIA_PENDING", "REJECTED_MUTATION", "STALE_DEVICE"]);
    const rejected = list.items.find((i) => i.kind === "REJECTED_MUTATION");
    expect(rejected).toMatchObject({ id: mutationId, userName: "Olga Operadora", params: { code: "GUARD_SIGNATURE_REQUIRED", ref: "OS-000001" } });
    expect(list.items.every((i) => i.userId !== OTHER_USER)).toBe(true);
  });

  it("requires a note and resolves a rejected mutation once; the second resolver sees who resolved it", async () => {
    const mutationId = await seedRejected();
    await expect(resolveAttention({ orgId: ORG, userId: ADMIN }, "rejected-mutation", mutationId, { note: "  " }, deps())).rejects.toSatisfy(
      (e) => code(e) === "GUARD_RESOLUTION_REQUIRED",
    );
    await expect(resolveAttention({ orgId: ORG, userId: ADMIN }, "rejected-mutation", mutationId, { note: "x".repeat(1001) }, deps())).rejects.toSatisfy(
      (e) => code(e) === "VALIDATION_FAILED",
    );

    const results = await Promise.allSettled([
      resolveAttention({ orgId: ORG, userId: ADMIN }, "rejected-mutation", mutationId, { note: "Refeito no escritório" }, deps()),
      resolveAttention({ orgId: ORG, userId: MANAGER }, "rejected-mutation", mutationId, { note: "Eu também" }, deps()),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);
    const error = failed[0]?.reason as DomainError;
    expect(error.code).toBe("ALREADY_RESOLVED");
    expect(error.details).toMatchObject({ resolverName: expect.any(String), note: expect.any(String) });

    const list = await listAttention({ orgId: ORG }, deps());
    expect(list.items.some((i) => i.id === mutationId)).toBe(false);
    const events = await collections.activityEvents(handle.db).countDocuments({ organizationId: ORG, action: "attention.resolved" });
    expect(events).toBe(1);

    const winner = ok[0]?.status === "fulfilled" ? ok[0].value : undefined;
    const row = await collections.processedMutations(handle.db).findOne({ organizationId: ORG, mutationId });
    expect(row).toMatchObject({ resolvedAt: NOW, resolvedById: winner?.resolvedById, resolutionNote: winner?.note });
    expect(row?.syncVersion).toEqual(expect.any(Number));
    expect(error.details).toMatchObject({ resolvedAt: NOW.toISOString(), note: winner?.note });
  });

  it("resolves a legacy rejected mutation stored without resolution fields", async () => {
    const mutationId = await seedRejected();
    await collections.processedMutations(handle.db).updateOne({ mutationId }, { $unset: { resolvedAt: "" } });
    expect((await listAttention({ orgId: ORG }, deps())).items.some((i) => i.id === mutationId)).toBe(true);
    const resolved = await resolveAttention({ orgId: ORG, userId: MANAGER }, "rejected-mutation", mutationId, { note: "Conferido" }, deps());
    expect(resolved).toMatchObject({ kind: "REJECTED_MUTATION", id: mutationId, resolverName: "Marcos Gerente", note: "Conferido" });
    expect(await collections.processedMutations(handle.db).findOne({ mutationId })).toMatchObject({ resolvedAt: NOW, resolvedById: MANAGER, resolutionNote: "Conferido" });
    expect((await listAttention({ orgId: ORG }, deps())).items.some((i) => i.id === mutationId)).toBe(false);
    await expect(resolveAttention({ orgId: ORG, userId: ADMIN }, "rejected-mutation", mutationId, { note: "x" }, deps())).rejects.toSatisfy(
      (e) => code(e) === "ALREADY_RESOLVED" && ((e as DomainError).details as { resolverName?: string } | undefined)?.resolverName === "Marcos Gerente",
    );
  });

  it("resolves a stale device through an activity event and hides it until it goes stale again", async () => {
    await collections.devices(handle.db).insertOne({
      _id: DEVICE,
      organizationId: ORG,
      userId: OPERATOR,
      installationId: "inst",
      platform: "android",
      pendingMutations: 1,
      pendingUploads: 0,
      oldestPendingAt: new Date(NOW.getTime() - 30 * HOUR),
      lastSyncAt: new Date(NOW.getTime() - 30 * HOUR),
      createdAt: NOW,
      updatedAt: NOW,
    } as never);
    const resolved = await resolveAttention({ orgId: ORG, userId: ADMIN }, "stale-device", DEVICE, { note: "Liguei para a operadora" }, deps());
    expect(resolved.resolverName).toBe("Ana Admin");
    await expect(resolveAttention({ orgId: ORG, userId: MANAGER }, "stale-device", DEVICE, { note: "de novo" }, deps())).rejects.toSatisfy(
      (e) => code(e) === "ALREADY_RESOLVED",
    );
    expect((await listAttention({ orgId: ORG }, deps())).items).toHaveLength(0);
  });

  it("returns NOT_FOUND for another tenant's item", async () => {
    const mutationId = await seedRejected(OTHER, OTHER_USER);
    await expect(resolveAttention({ orgId: ORG, userId: ADMIN }, "rejected-mutation", mutationId, { note: "x" }, deps())).rejects.toSatisfy(
      (e) => code(e) === "NOT_FOUND",
    );
  });
});
