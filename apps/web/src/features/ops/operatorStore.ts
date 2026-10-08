import type { OperatorState } from "@agrorende/contracts/realtime";

import type { LiveOperatorDTO } from "./types";

/** Markers glide between fixes over 1.5 s (A§14.3 smooth movement). */
export const INTERPOLATION_MS = 1_500;
/** Same threshold as core `OPERATOR_STALE_MS`: no fix or heartbeat for 5 minutes. */
export const OPERATOR_STALE_MS = 5 * 60_000;

export interface OperatorLocationUpdate {
  readonly userId: string;
  readonly lat: number;
  readonly lng: number;
  readonly heading?: number | undefined;
  readonly recordedAt: string;
  readonly state?: OperatorState | undefined;
}

export interface OperatorPresenceUpdate {
  readonly userId: string;
  readonly online: boolean;
  readonly dutyStatus: "ON_DUTY" | "OFF_DUTY";
  readonly lastSeenAt?: string | undefined;
}

export interface OperatorMarker {
  readonly userId: string;
  readonly name: string;
  readonly state: OperatorState;
  readonly dutyStatus: "ON_DUTY" | "OFF_DUTY";
  readonly lat: number;
  readonly lng: number;
  readonly heading: number | null;
  readonly recordedAt: string;
  readonly lastSeenAt: string | null;
  readonly stale: boolean;
  readonly deviceId: string | null;
  readonly activeWorkOrderId: string | null;
}

interface Entry {
  marker: OperatorMarker;
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
  startedAt: number;
}

export interface PointFeature {
  readonly type: "Feature";
  readonly id?: string;
  readonly geometry: { readonly type: "Point"; readonly coordinates: readonly [number, number] };
  readonly properties: Readonly<Record<string, string | number | boolean | null>>;
}

export interface PointCollection {
  readonly type: "FeatureCollection";
  readonly features: readonly PointFeature[];
}

function lastActivity(marker: Pick<OperatorMarker, "recordedAt" | "lastSeenAt">): number {
  const fix = Date.parse(marker.recordedAt);
  const seen = marker.lastSeenAt === null ? Number.NaN : Date.parse(marker.lastSeenAt);
  return Math.max(Number.isFinite(fix) ? fix : 0, Number.isFinite(seen) ? seen : 0);
}

export function isStale(marker: Pick<OperatorMarker, "recordedAt" | "lastSeenAt">, now: number): boolean {
  return now - lastActivity(marker) > OPERATOR_STALE_MS;
}

function ease(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

/**
 * Live operator positions for the Ops Center map. Socket fixes set a target; `step()` interpolates
 * every moving marker and the frame loop pushes one `setData` per animation frame for all of them.
 */
export class OperatorStore {
  private readonly entries = new Map<string, Entry>();
  private readonly listeners = new Set<() => void>();
  private snapshot: readonly OperatorMarker[] = [];
  private dirty = false;

  constructor(private readonly clock: () => number = () => performance.now()) {}

  load(operators: readonly LiveOperatorDTO[], wallNow = Date.now()): void {
    this.entries.clear();
    const at = this.clock();
    for (const o of operators) {
      const marker: OperatorMarker = {
        userId: o.userId,
        name: o.name,
        state: o.state,
        dutyStatus: o.dutyStatus,
        lat: o.lat,
        lng: o.lng,
        heading: o.heading,
        recordedAt: o.recordedAt,
        lastSeenAt: o.lastSeenAt,
        stale: o.stale || isStale(o, wallNow),
        deviceId: o.deviceId,
        activeWorkOrderId: o.activeWorkOrderId,
      };
      this.entries.set(o.userId, { marker, fromLat: o.lat, fromLng: o.lng, toLat: o.lat, toLng: o.lng, startedAt: at - INTERPOLATION_MS });
    }
    this.dirty = true;
    this.publish();
  }

  /** Applies one `operator:location` fix; returns false for unknown operators or out-of-order fixes. */
  applyLocation(update: OperatorLocationUpdate, wallNow = Date.now()): boolean {
    const entry = this.entries.get(update.userId);
    if (entry === undefined) return false;
    if (Date.parse(update.recordedAt) < Date.parse(entry.marker.recordedAt)) return false;
    entry.fromLat = entry.marker.lat;
    entry.fromLng = entry.marker.lng;
    entry.toLat = update.lat;
    entry.toLng = update.lng;
    entry.startedAt = this.clock();
    const next = { ...entry.marker, recordedAt: update.recordedAt, heading: update.heading ?? entry.marker.heading, state: update.state ?? entry.marker.state };
    entry.marker = { ...next, stale: isStale(next, wallNow) };
    this.dirty = true;
    this.publish();
    return true;
  }

  /** Adds an operator who was not in the snapshot (first fix after going on duty). */
  upsertFromFix(update: OperatorLocationUpdate & { readonly name: string }, wallNow = Date.now()): void {
    if (this.applyLocation(update, wallNow)) return;
    const marker: OperatorMarker = {
      userId: update.userId,
      name: update.name,
      state: update.state ?? "IDLE",
      dutyStatus: "ON_DUTY",
      lat: update.lat,
      lng: update.lng,
      heading: update.heading ?? null,
      recordedAt: update.recordedAt,
      lastSeenAt: null,
      stale: false,
      deviceId: null,
      activeWorkOrderId: null,
    };
    this.entries.set(update.userId, { marker, fromLat: update.lat, fromLng: update.lng, toLat: update.lat, toLng: update.lng, startedAt: this.clock() - INTERPOLATION_MS });
    this.dirty = true;
    this.publish();
  }

  applyPresence(update: OperatorPresenceUpdate, wallNow = Date.now()): void {
    const entry = this.entries.get(update.userId);
    if (entry === undefined) return;
    const next = {
      ...entry.marker,
      dutyStatus: update.dutyStatus,
      lastSeenAt: update.lastSeenAt ?? entry.marker.lastSeenAt,
      state: update.online ? entry.marker.state : ("OFFLINE" as const),
    };
    entry.marker = { ...next, stale: isStale(next, wallNow) };
    this.dirty = true;
    this.publish();
  }

  /** Re-evaluates the five-minute staleness without a new fix (EC-OPS-20). */
  refreshStale(wallNow = Date.now()): void {
    let changed = false;
    for (const entry of this.entries.values()) {
      const stale = isStale(entry.marker, wallNow);
      if (stale !== entry.marker.stale) {
        entry.marker = { ...entry.marker, stale };
        changed = true;
      }
    }
    if (changed) {
      this.dirty = true;
      this.publish();
    }
  }

  /** Advances every marker to `now`; returns true while any marker is still moving. */
  step(now = this.clock()): boolean {
    let moving = false;
    for (const entry of this.entries.values()) {
      const t = Math.min(1, Math.max(0, (now - entry.startedAt) / INTERPOLATION_MS));
      const k = ease(t);
      const lat = entry.fromLat + (entry.toLat - entry.fromLat) * k;
      const lng = entry.fromLng + (entry.toLng - entry.fromLng) * k;
      if (lat !== entry.marker.lat || lng !== entry.marker.lng) {
        entry.marker = { ...entry.marker, lat, lng };
        this.dirty = true;
      }
      if (t < 1) moving = true;
    }
    return moving;
  }

  /** True when positions changed since the last `takeFrame()`. */
  get needsFrame(): boolean {
    return this.dirty;
  }

  /** One GeoJSON collection for every operator: what the frame loop hands to `setData`. */
  takeFrame(): PointCollection {
    this.dirty = false;
    const features: PointFeature[] = [];
    for (const { marker } of this.entries.values()) {
      features.push({
        type: "Feature",
        id: marker.userId,
        geometry: { type: "Point", coordinates: [marker.lng, marker.lat] },
        properties: {
          userId: marker.userId,
          name: marker.name,
          initials: initials(marker.name),
          state: marker.state,
          stale: marker.stale,
          heading: marker.heading ?? 0,
        },
      });
    }
    return { type: "FeatureCollection", features };
  }

  list(): readonly OperatorMarker[] {
    return this.snapshot;
  }

  get(userId: string): OperatorMarker | undefined {
    return this.entries.get(userId)?.marker;
  }

  get size(): number {
    return this.entries.size;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private publish(): void {
    this.snapshot = [...this.entries.values()].map((e) => ({ ...e.marker, lat: e.toLat, lng: e.toLng }));
    for (const listener of this.listeners) listener();
  }
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/u).filter((p) => p.length > 0);
  const first = parts[0]?.[0] ?? "?";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return `${first}${last}`.toUpperCase();
}

export interface FrameScheduler {
  request(callback: (time: number) => void): number;
  cancel(handle: number): void;
}

const browserScheduler: FrameScheduler = {
  request: (callback) => requestAnimationFrame(callback),
  cancel: (handle) => cancelAnimationFrame(handle),
};

/**
 * Drives `store.step()` with `requestAnimationFrame` only while something moves, and calls
 * `onFrame` at most once per frame with the whole collection (one `setData` per frame).
 */
export function startFrameLoop(store: OperatorStore, onFrame: (data: PointCollection) => void, scheduler: FrameScheduler = browserScheduler): () => void {
  let handle: number | null = null;
  const tick = (time: number) => {
    handle = null;
    const moving = store.step(time);
    if (store.needsFrame) onFrame(store.takeFrame());
    if (moving) handle = scheduler.request(tick);
  };
  const wake = () => {
    if (handle === null) handle = scheduler.request(tick);
  };
  const unsubscribe = store.subscribe(wake);
  wake();
  return () => {
    unsubscribe();
    if (handle !== null) scheduler.cancel(handle);
    handle = null;
  };
}
