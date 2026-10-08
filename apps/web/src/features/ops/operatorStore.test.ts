import { describe, expect, it } from "vitest";

import { applyKpiFilter, filterAlerts, groupAlerts, trailHasGaps, trailSegments } from "./filters";
import { INTERPOLATION_MS, OperatorStore, startFrameLoop, type FrameScheduler, type PointCollection } from "./operatorStore";
import type { LiveOperatorDTO, OpsAlertDTO } from "./types";

const NOW = Date.parse("2025-03-10T12:00:00.000Z");

function operator(i: number, overrides: Partial<LiveOperatorDTO> = {}): LiveOperatorDTO {
  return {
    userId: `user-${i}`,
    name: `Operador ${i}`,
    lat: -15 - i / 1000,
    lng: -47 - i / 1000,
    accuracyM: null,
    heading: null,
    speedMps: null,
    recordedAt: new Date(NOW).toISOString(),
    lastSeenAt: null,
    dutyStatus: "ON_DUTY",
    state: "WORKING",
    stale: false,
    deviceId: null,
    activeWorkOrderId: null,
    ...overrides,
  };
}

function manualScheduler() {
  const queue = new Map<number, (time: number) => void>();
  let next = 1;
  const scheduler: FrameScheduler = {
    request: (cb) => {
      const id = next;
      next += 1;
      queue.set(id, cb);
      return id;
    },
    cancel: (id) => queue.delete(id),
  };
  return {
    scheduler,
    pending: () => queue.size,
    flush: (time: number) => {
      const callbacks = [...queue.values()];
      queue.clear();
      for (const cb of callbacks) cb(time);
    },
  };
}

describe("OperatorStore", () => {
  it("interpolates a fix over 1.5 s and ignores out-of-order fixes", () => {
    let clock = 0;
    const store = new OperatorStore(() => clock);
    store.load([operator(1)], NOW);
    expect(store.applyLocation({ userId: "user-1", lat: -16, lng: -48, recordedAt: new Date(NOW + 5_000).toISOString() }, NOW)).toBe(true);
    store.step(INTERPOLATION_MS / 2);
    const mid = store.get("user-1");
    expect(mid?.lat).toBeLessThan(-15.001);
    expect(mid?.lat).toBeGreaterThan(-16);
    clock = INTERPOLATION_MS;
    expect(store.step(clock)).toBe(false);
    expect(store.get("user-1")?.lat).toBe(-16);
    expect(store.applyLocation({ userId: "user-1", lat: 0, lng: 0, recordedAt: new Date(NOW).toISOString() }, NOW)).toBe(false);
    expect(store.applyLocation({ userId: "nobody", lat: 0, lng: 0, recordedAt: new Date(NOW).toISOString() }, NOW)).toBe(false);
  });

  it("marks an operator stale after five minutes without a fix or heartbeat (EC-OPS-20)", () => {
    const store = new OperatorStore(() => 0);
    store.load([operator(1)], NOW);
    expect(store.get("user-1")?.stale).toBe(false);
    store.refreshStale(NOW + 5 * 60_000 + 1);
    expect(store.get("user-1")?.stale).toBe(true);
    store.applyPresence({ userId: "user-1", online: true, dutyStatus: "ON_DUTY", lastSeenAt: new Date(NOW + 5 * 60_000).toISOString() }, NOW + 5 * 60_000 + 1);
    expect(store.get("user-1")?.stale).toBe(false);
  });

  it("pushes one setData per frame for many simultaneous fixes and stops when idle", () => {
    let clock = 0;
    const store = new OperatorStore(() => clock);
    store.load(Array.from({ length: 50 }, (_, i) => operator(i)), NOW);
    const frames: PointCollection[] = [];
    const raf = manualScheduler();
    const stop = startFrameLoop(store, (f) => frames.push(f), raf.scheduler);
    raf.flush(0);
    frames.length = 0;
    for (let i = 0; i < 50; i += 1) store.applyLocation({ userId: `user-${i}`, lat: -20, lng: -50, recordedAt: new Date(NOW + 1_000).toISOString() }, NOW);
    expect(raf.pending()).toBe(1);
    clock = 100;
    raf.flush(100);
    expect(frames).toHaveLength(1);
    expect(frames[0]?.features).toHaveLength(50);
    raf.flush(INTERPOLATION_MS + 200);
    expect(frames).toHaveLength(2);
    expect(frames[1]?.features.every((f) => f.geometry.coordinates[0] === -50)).toBe(true);
    expect(raf.pending()).toBe(0);
    stop();
  });

  it("processes a batch of 300 operator fixes and one frame well under 50 ms", () => {
    let clock = 0;
    const store = new OperatorStore(() => clock);
    store.load(Array.from({ length: 300 }, (_, i) => operator(i)), NOW);
    const raf = manualScheduler();
    let frame: PointCollection | null = null;
    const stop = startFrameLoop(store, (f) => {
      frame = f;
    }, raf.scheduler);
    raf.flush(0);
    const samples: number[] = [];
    for (let round = 1; round <= 10; round += 1) {
      const started = performance.now();
      for (let i = 0; i < 300; i += 1) {
        store.applyLocation({ userId: `user-${i}`, lat: -15 - round / 100, lng: -47 - round / 100, recordedAt: new Date(NOW + round * 1_000).toISOString() }, NOW);
      }
      clock += 16;
      raf.flush(clock);
      samples.push(performance.now() - started);
    }
    stop();
    samples.sort((a, b) => a - b);
    const p95 = samples[Math.floor(samples.length * 0.95) - 1] ?? Number.POSITIVE_INFINITY;
    console.info(`[T09 perf] 300 operator fixes + frame: median ${samples[5]?.toFixed(2)} ms, p95 ${p95.toFixed(2)} ms, max ${samples.at(-1)?.toFixed(2)} ms`);
    expect((frame as PointCollection | null)?.features).toHaveLength(300);
    expect(p95).toBeLessThan(50);
  });
});

function alert(type: OpsAlertDTO["type"], i: number, severity: OpsAlertDTO["severity"] = "warning"): OpsAlertDTO {
  return { id: `${type}-${i}`, type, severity, entityType: "WORK_ORDER", entityId: `e-${i}`, label: `L${i}`, at: new Date(NOW - i * 1000).toISOString(), params: {} };
}

describe("ops filters", () => {
  it("groups alerts by type, most severe first, collapsing only large groups", () => {
    const groups = groupAlerts([...Array.from({ length: 100 }, (_, i) => alert("SLA_AT_RISK", i)), alert("SLA_BREACHED", 1, "critical")]);
    expect(groups.map((g) => g.type)).toEqual(["SLA_BREACHED", "SLA_AT_RISK"]);
    expect(groups[0]?.collapsible).toBe(false);
    expect(groups[1]?.collapsible).toBe(true);
    expect(groups[1]?.items).toHaveLength(100);
  });

  it("filters map layers and alerts by KPI", () => {
    const store = new OperatorStore(() => 0);
    store.load([operator(1), operator(2, { dutyStatus: "OFF_DUTY" })], NOW);
    const view = {
      operators: store.list(),
      reports: [],
      workOrders: [
        { id: "a", number: "1", title: "", status: "ASSIGNED", priority: "HIGH", assigneeId: "u", assetId: null, lat: 0, lng: 0, dueAt: null, sla: "AT_RISK" },
        { id: "b", number: "2", title: "", status: "OPEN", priority: "LOW", assigneeId: null, assetId: null, lat: 0, lng: 0, dueAt: null, sla: null },
      ] as const,
      assets: [],
      rentals: [],
    };
    expect(applyKpiFilter(view, "sla_at_risk").workOrders.map((w) => w.id)).toEqual(["a"]);
    expect(applyKpiFilter(view, "unassigned_wos").workOrders.map((w) => w.id)).toEqual(["b"]);
    expect(applyKpiFilter(view, "on_duty").operators).toHaveLength(1);
    expect(applyKpiFilter(view, null)).toBe(view);
    expect(filterAlerts([alert("SLA_AT_RISK", 1), alert("OVERDUE_RENTAL", 2)], "overdue_rentals").map((a) => a.type)).toEqual(["OVERDUE_RENTAL"]);
  });

  it("breaks the trail line at gaps longer than ten minutes", () => {
    const at = (min: number) => new Date(NOW + min * 60_000).toISOString();
    const p = (min: number) => ({ lat: min, lng: min, recordedAt: at(min), accuracyM: null, speedMps: null, heading: null });
    expect(trailSegments([p(0), p(1), p(30), p(31)])).toEqual([
      [[0, 0], [1, 1]],
      [[30, 30], [31, 31]],
    ]);
    expect(trailHasGaps([p(0), p(5)])).toBe(false);
  });
});
