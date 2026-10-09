/**
 * `pnpm simulate` — drives the seeded field operators so the live map has motion without phones
 * (ARCHITECTURE §10, "Simulator"). Each simulated operator logs in with a stable device id, goes
 * ON_DUTY, streams GPS fixes over the realtime socket (falling back to REST), and walks its
 * assigned work orders through accept → startRoute → arrive → startWork → complete with real
 * photos, checklist answers and an absent-signature reason. With nothing to do it patrols the
 * seed sites. Ctrl-C sets every simulated operator OFF_DUTY before exiting.
 *
 * Flags: --speed <n> (simulated-time multiplier, default 1), --users <email,email>,
 * --base-url <url>, --ws-url <url>, --password <pw>, --duration <seconds>, --help.
 */
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs, parseEnv } from "node:util";

import type { ChecklistItem, ChecklistResponse } from "@agrorende/contracts/checklist";
import { AssetDTOSchema, PlotDTOSchema, SiteDTOSchema, WorkOrderDTOSchema, type WorkOrderDTO } from "@agrorende/contracts/dto";
import { RealtimeClientEvents, type LocationFix } from "@agrorende/contracts/realtime";
import type { MutationName, MutationResult } from "@agrorende/contracts/sync";
import { io, type Socket } from "socket.io-client";

// The worker does not yet declare @agrorende/api-client as a dependency (change request T13-001).
import { AgrorendeApiClient, isApiError } from "../../../packages/api-client/src/index.js";

// ───────── Configuration ─────────

const DEFAULT_USERS = ["tecnico1@agrorende.dev", "tecnico2@agrorende.dev", "tecnico3@agrorende.dev", "locacao@agrorende.dev"];
const TICK_MS = 3_000;
const PULL_EVERY_MS = 30_000;
const PING_EVERY_MS = 25_000;
const ARRIVE_RADIUS_M = 50;
const SHUTDOWN_TIMEOUT_MS = 8_000;
const MAX_BUFFERED_FIXES = 500;

/** Simulated seconds spent in each step before the operator acts. */
const TIMELINE = { accept: 15, startRoute: 20, startWork: 60, complete: 300, patrolPause: 60 } as const;

const ACTIVE_ORDER = ["IN_PROGRESS", "ON_SITE", "EN_ROUTE", "ACCEPTED", "ASSIGNED"] as const;
type ActiveStatus = (typeof ACTIVE_ORDER)[number];

/** Seed sites from ARCHITECTURE §17, used when the pull returns no sites. */
const FALLBACK_SITES: readonly Waypoint[] = [
  { id: "oficina", name: "Oficina Central Ribeirão Preto", lat: -21.17, lng: -47.81 },
  { id: "patio", name: "Pátio Sertãozinho", lat: -21.137, lng: -47.99 },
  { id: "boa-vista", name: "Fazenda Boa Vista", lat: -21.017, lng: -47.764 },
  { id: "santa-clara", name: "Fazenda Santa Clara", lat: -21.34, lng: -47.729 },
  { id: "sao-jose", name: "Fazenda São José", lat: -21.211, lng: -47.595 },
];

/** An 8×8 JPEG, the same fixture `pnpm smoke` uploads. */
const PHOTO = Buffer.from(
  "/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAIAAgDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAABQb/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCQACJl/9k=",
  "base64",
);

interface Waypoint {
  readonly id: string;
  readonly name: string;
  readonly lat: number;
  readonly lng: number;
}

interface Options {
  readonly speed: number;
  readonly users: readonly string[];
  readonly baseUrl: string;
  readonly wsUrl: string;
  readonly password: string;
  readonly durationS: number | null;
}

// ───────── Small helpers ─────────

function log(message: string): void {
  process.stdout.write(`[simulate] ${new Date().toISOString().slice(11, 19)} ${message}\n`);
}

/** The e-mail local part only, so logs carry no full address. */
function tag(email: string): string {
  return email.split("@")[0] ?? "user";
}

function errorText(error: unknown): string {
  if (isApiError(error)) return `${error.code} (HTTP ${String(error.status)})`;
  return error instanceof Error ? error.message : String(error);
}

function sleep(ms: number): Promise<void> {
  return new Promise((done) => setTimeout(done, ms));
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([promise, sleep(ms).then(() => null)]);
}

/** A stable RFC 4122 v5-style uuid, so a user keeps the same simulated device across runs. */
function stableUuid(seed: string): string {
  const bytes = createHash("sha1").update(`agrorende-simulator:${seed}`).digest().subarray(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function hashUnit(seed: string): number {
  return createHash("sha1").update(seed).digest().readUInt32BE(0) / 0xffffffff;
}

const EARTH_RADIUS_M = 6_371_000;
const rad = (deg: number): number => (deg * Math.PI) / 180;
const deg = (radians: number): number => (radians * 180) / Math.PI;

function distanceM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

function bearingDeg(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const y = Math.sin(rad(bLng - aLng)) * Math.cos(rad(bLat));
  const x = Math.cos(rad(aLat)) * Math.sin(rad(bLat)) - Math.sin(rad(aLat)) * Math.cos(rad(bLat)) * Math.cos(rad(bLng - aLng));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

// ───────── Environment and flags ─────────

/** `pnpm --filter worker run simulate` runs without `--env-file`, so read the root `.env` for missing keys. */
function loadRootEnv(): void {
  const path = resolve(import.meta.dirname, "../../../.env");
  if (!existsSync(path)) return;
  const parsed = parseEnv(readFileSync(path, "utf8"));
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined && value !== undefined) process.env[key] = value;
  }
}

const HELP = `Usage: pnpm simulate [options]

Drives seeded field operators: GPS fixes on the live map and work orders walked to completion.

  --speed <n>        Simulated-time multiplier (default 1; 10 runs ten times faster)
  --users <emails>   Comma-separated logins (default ${DEFAULT_USERS.join(",")})
  --base-url <url>   API base URL (default APP_URL or http://localhost:3000)
  --ws-url <url>     Realtime URL (default NEXT_PUBLIC_REALTIME_URL or http://localhost:4001)
  --password <pw>    Password for every user (default SEED_PASSWORD or agrorende123)
  --duration <s>     Stop by itself after this many real seconds
  --help             Show this help

Ctrl-C sets every simulated operator OFF_DUTY before exiting.
`;

function parseOptions(): Options | null {
  const { values } = parseArgs({
    args: process.argv.slice(2).filter((arg) => arg !== "--"),
    options: {
      speed: { type: "string" },
      users: { type: "string" },
      "base-url": { type: "string" },
      "ws-url": { type: "string" },
      password: { type: "string" },
      duration: { type: "string" },
      help: { type: "boolean" },
    },
    strict: true,
  });
  if (values.help === true) {
    process.stdout.write(HELP);
    return null;
  }
  const speed = Number(values.speed ?? "1");
  if (!Number.isFinite(speed) || speed <= 0) throw new Error("--speed must be a positive number");
  const duration = values.duration === undefined ? null : Number(values.duration);
  if (duration !== null && (!Number.isFinite(duration) || duration <= 0)) throw new Error("--duration must be a positive number of seconds");
  const users = (values.users ?? DEFAULT_USERS.join(","))
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.length > 0);
  if (users.length === 0) throw new Error("--users must list at least one e-mail");
  return {
    speed,
    users: [...new Set(users)],
    baseUrl: values["base-url"] ?? process.env.APP_URL ?? "http://localhost:3000",
    wsUrl: values["ws-url"] ?? process.env.NEXT_PUBLIC_REALTIME_URL ?? `http://localhost:${process.env.REALTIME_PORT ?? "4001"}`,
    password: values.password ?? process.env.SEED_PASSWORD ?? "agrorende123",
    durationS: duration,
  };
}

// ───────── One simulated operator ─────────

class SimulatedOperator {
  readonly name: string;
  readonly deviceId: string;
  private readonly api: AgrorendeApiClient;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private userId = "";
  private homeSiteId: string | null = null;
  private cursor: string | undefined;
  private scopeEpoch = 0;
  private socket: Socket | null = null;

  private readonly workOrders = new Map<string, WorkOrderDTO>();
  private readonly waypoints = new Map<string, Waypoint>();
  private readonly assetSpots = new Map<string, { lat: number; lng: number }>();
  private readonly plotSpots = new Map<string, { lat: number; lng: number }>();

  private lat = FALLBACK_SITES[1]?.lat ?? -21.137;
  private lng = FALLBACK_SITES[1]?.lng ?? -47.99;
  private heading = 0;
  private readonly kmh: number;
  private simClockS = 0;
  private lastPullAt = 0;
  private lastPingAt = 0;
  private busy = false;
  /** True when the last tick moved the operator, so the fix reports a non-zero speed. */
  private moving = false;
  private pendingFixes: LocationFix[] = [];
  /** `<workOrderId>:<status>` → simulated second at which the operator first saw that state. */
  private readonly seenAt = new Map<string, number>();
  private patrol: { target: Waypoint; pauseUntilS: number | null } | null = null;
  private readonly completed = new Set<string>();

  constructor(
    readonly email: string,
    private readonly options: Options,
  ) {
    this.name = tag(email);
    this.deviceId = stableUuid(email);
    this.kmh = 40 + Math.round(hashUnit(email) * 40);
    this.api = new AgrorendeApiClient({
      baseUrl: options.baseUrl,
      tokenProvider: () => this.accessToken,
      onUnauthorized: () => this.refreshSession(),
    });
  }

  async start(): Promise<void> {
    const session = await this.api.login({ email: this.email, password: this.options.password, deviceId: this.deviceId, platform: "ANDROID" });
    if (session.accessToken === undefined || session.refreshToken === undefined) throw new Error("login returned no token pair");
    this.accessToken = session.accessToken;
    this.refreshToken = session.refreshToken;
    this.userId = session.user.id;
    this.homeSiteId = session.user.homeSiteId ?? null;
    await this.pull();
    this.placeAtStart();
    const duty = await this.push("user.setDuty", { status: "ON_DUTY", consent: true });
    if (duty?.status !== "APPLIED") throw new Error(`could not go ON_DUTY (${duty?.status === "REJECTED" ? duty.code : "no result"})`);
    this.connectSocket();
    log(`${this.name}: ON_DUTY at ${this.lat.toFixed(4)},${this.lng.toFixed(4)}, ${String(this.kmh)} km/h, ${String(this.workOrders.size)} work order(s) in scope`);
  }

  async stop(): Promise<void> {
    this.socket?.disconnect();
    this.socket = null;
    if (this.accessToken === null) return;
    await this.flushFixesRest();
    const result = await this.push("user.setDuty", { status: "OFF_DUTY" });
    log(`${this.name}: OFF_DUTY ${result?.status ?? "not confirmed"}`);
  }

  /** Called every real `TICK_MS`; never runs twice at once for the same operator. */
  async tick(): Promise<void> {
    if (this.busy || this.accessToken === null) return;
    this.busy = true;
    try {
      const stepS = (TICK_MS / 1000) * this.options.speed;
      this.simClockS += stepS;
      const now = Date.now();
      if (now - this.lastPullAt >= PULL_EVERY_MS) await this.pull();
      if (this.socket?.connected === true && now - this.lastPingAt >= PING_EVERY_MS) {
        this.socket.emit(RealtimeClientEvents.presencePing, {});
        this.lastPingAt = now;
      }
      this.moving = false;
      const workOrder = this.currentWorkOrder();
      if (workOrder === null) this.patrolStep(stepS);
      else await this.workStep(workOrder, stepS);
      await this.sendFix(workOrder?.id);
    } catch (error) {
      log(`${this.name}: tick failed: ${errorText(error)}`);
    } finally {
      this.busy = false;
    }
  }

  // ───── Session ─────

  private async refreshSession(): Promise<boolean> {
    if (this.refreshToken === null) return false;
    try {
      const next = await this.api.refresh({ refreshToken: this.refreshToken });
      if (next.accessToken === undefined) return false;
      this.accessToken = next.accessToken;
      if (next.refreshToken !== undefined) this.refreshToken = next.refreshToken;
      return true;
    } catch (error) {
      log(`${this.name}: refresh failed: ${errorText(error)}`);
      return false;
    }
  }

  private connectSocket(): void {
    const socket = io(this.options.wsUrl, {
      transports: ["websocket"],
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 10_000,
      auth: (cb: (data: object) => void) => {
        this.api
          .socketToken()
          .then((response) => cb({ token: response.token }))
          .catch((error: unknown) => {
            log(`${this.name}: socket token failed: ${errorText(error)}`);
            cb({});
          });
      },
    });
    socket.on("connect", () => log(`${this.name}: realtime connected`));
    socket.on("disconnect", (reason) => log(`${this.name}: realtime disconnected (${reason})`));
    socket.on("connect_error", (error) => log(`${this.name}: realtime connect error: ${error.message}`));
    this.socket = socket;
  }

  // ───── Sync ─────

  private async pull(): Promise<void> {
    this.lastPullAt = Date.now();
    for (let page = 0; page < 50; page += 1) {
      const response = await this.api.syncPull({ cursor: this.cursor, deviceId: this.deviceId, scopeEpoch: this.scopeEpoch });
      if (response.resetRequired) this.workOrders.clear();
      this.cursor = response.cursor;
      this.scopeEpoch = response.scopeEpoch;
      for (const row of response.changes.sites ?? []) {
        const site = SiteDTOSchema.safeParse(row);
        if (site.success && site.data.lat != null && site.data.lng != null) {
          this.waypoints.set(site.data.id, { id: site.data.id, name: site.data.name, lat: site.data.lat, lng: site.data.lng });
        }
      }
      for (const row of response.changes.plots ?? []) {
        const plot = PlotDTOSchema.safeParse(row);
        if (plot.success && plot.data.centroidLat != null && plot.data.centroidLng != null) {
          this.plotSpots.set(plot.data.id, { lat: plot.data.centroidLat, lng: plot.data.centroidLng });
        }
      }
      for (const row of response.changes.assets ?? []) {
        const asset = AssetDTOSchema.safeParse(row);
        if (asset.success && asset.data.lastLat != null && asset.data.lastLng != null) {
          this.assetSpots.set(asset.data.id, { lat: asset.data.lastLat, lng: asset.data.lastLng });
        }
      }
      for (const row of response.changes.workOrders ?? []) {
        const workOrder = WorkOrderDTOSchema.safeParse(row);
        if (workOrder.success) this.workOrders.set(workOrder.data.id, workOrder.data);
      }
      for (const id of response.deleted.workOrders ?? []) this.workOrders.delete(id);
      for (const id of response.deleted.sites ?? []) this.waypoints.delete(id);
      if (!response.hasMore) return;
    }
  }

  private async push(name: MutationName, payload: unknown): Promise<MutationResult | null> {
    const occurredAt = new Date().toISOString();
    const id = randomUUID();
    const response = await this.api.syncPush({
      deviceId: this.deviceId,
      clientTime: occurredAt,
      deviceStatus: {
        appVersion: "simulator",
        runtimeVersion: "simulator",
        pendingMutations: 1,
        pendingUploads: 0,
        pendingBytes: 0,
        scopeEpoch: this.scopeEpoch,
      },
      mutations: [{ id, name, payload, occurredAt, lat: this.lat, lng: this.lng }],
    });
    const result = response.results.find((item) => item.id === id) ?? null;
    if (result?.status === "REJECTED") log(`${this.name}: ${name} rejected: ${result.code}`);
    if (result?.status === "RETRY") log(`${this.name}: ${name} asked to retry later`);
    return result;
  }

  // ───── Movement and location ─────

  private placeAtStart(): void {
    const sites = [...this.waypoints.values()];
    const start =
      (this.homeSiteId === null ? undefined : this.waypoints.get(this.homeSiteId)) ??
      sites.find((site) => site.name.includes("Sertãozinho")) ??
      sites[0] ??
      FALLBACK_SITES[1];
    if (start === undefined) return;
    // A small deterministic offset keeps operators who share a home site from stacking on one pin.
    this.lat = start.lat + (hashUnit(`${this.email}:lat`) - 0.5) * 0.004;
    this.lng = start.lng + (hashUnit(`${this.email}:lng`) - 0.5) * 0.004;
  }

  /** Moves toward the target; returns the remaining distance in metres. */
  private moveToward(lat: number, lng: number, stepS: number): number {
    const remaining = distanceM(this.lat, this.lng, lat, lng);
    if (remaining < 1) return 0;
    this.moving = true;
    this.heading = bearingDeg(this.lat, this.lng, lat, lng);
    const travel = (this.kmh / 3.6) * stepS;
    if (travel >= remaining) {
      this.lat = lat;
      this.lng = lng;
      return 0;
    }
    const fraction = travel / remaining;
    this.lat += (lat - this.lat) * fraction;
    this.lng += (lng - this.lng) * fraction;
    return remaining - travel;
  }

  private async sendFix(workOrderId: string | undefined): Promise<void> {
    const fix: LocationFix = {
      recordedAt: new Date().toISOString(),
      lat: Number(this.lat.toFixed(6)),
      lng: Number(this.lng.toFixed(6)),
      accuracyM: 5 + Math.round(hashUnit(`${this.email}:${String(this.simClockS)}`) * 10),
      speedMps: this.moving ? Number((this.kmh / 3.6).toFixed(1)) : 0,
      heading: Math.round(this.heading) % 360,
      batteryLevel: 0.85,
      ...(workOrderId === undefined ? {} : { workOrderId }),
    };
    this.pendingFixes.push(fix);
    if (this.pendingFixes.length > MAX_BUFFERED_FIXES) this.pendingFixes = this.pendingFixes.slice(-MAX_BUFFERED_FIXES);
    const batch = this.pendingFixes.slice(0, 50);
    if (this.socket?.connected === true) {
      const ack = await withTimeout(
        this.socket.timeout(5_000).emitWithAck(RealtimeClientEvents.locationBatch, { fixes: batch }) as Promise<unknown>,
        6_000,
      ).catch(() => null);
      if (ack !== null && typeof ack === "object" && "ok" in ack && ack.ok === true) {
        this.pendingFixes = this.pendingFixes.slice(batch.length);
        return;
      }
    }
    await this.flushFixesRest();
  }

  private async flushFixesRest(): Promise<void> {
    if (this.pendingFixes.length === 0) return;
    const batch = this.pendingFixes.slice(0, 500);
    try {
      await this.api.postLocationsBatch({ fixes: batch });
      this.pendingFixes = this.pendingFixes.slice(batch.length);
    } catch (error) {
      log(`${this.name}: ${String(batch.length)} fix(es) buffered: ${errorText(error)}`);
    }
  }

  private patrolStep(stepS: number): void {
    const sites = this.waypoints.size > 0 ? [...this.waypoints.values()] : FALLBACK_SITES;
    if (this.patrol === null) {
      // Pick the next site deterministically, never the one the operator is standing on.
      const candidates = sites.filter((site) => distanceM(this.lat, this.lng, site.lat, site.lng) > ARRIVE_RADIUS_M);
      const pool = candidates.length > 0 ? candidates : sites;
      const index = Math.floor(hashUnit(`${this.email}:${String(Math.floor(this.simClockS))}`) * pool.length) % pool.length;
      const target = pool[index] ?? pool[0];
      if (target === undefined) return;
      this.patrol = { target, pauseUntilS: null };
      log(`${this.name}: patrolling to ${target.name}`);
    }
    const { target, pauseUntilS } = this.patrol;
    if (pauseUntilS !== null) {
      if (this.simClockS >= pauseUntilS) this.patrol = null;
      return;
    }
    if (this.moveToward(target.lat, target.lng, stepS) === 0) this.patrol = { target, pauseUntilS: this.simClockS + TIMELINE.patrolPause };
  }

  // ───── Work orders ─────

  private currentWorkOrder(): WorkOrderDTO | null {
    for (const status of ACTIVE_ORDER) {
      const match = [...this.workOrders.values()]
        .filter((wo) => wo.status === status && wo.assigneeId === this.userId && wo.deletedAt == null && !this.completed.has(wo.id))
        .sort((a, b) => a.number.localeCompare(b.number))[0];
      if (match !== undefined) return match;
    }
    return null;
  }

  private destination(workOrder: WorkOrderDTO): { lat: number; lng: number } | null {
    if (workOrder.destLat != null && workOrder.destLng != null) return { lat: workOrder.destLat, lng: workOrder.destLng };
    const asset = workOrder.assetId == null ? undefined : this.assetSpots.get(workOrder.assetId);
    if (asset !== undefined) return asset;
    const plot = workOrder.plotId == null ? undefined : this.plotSpots.get(workOrder.plotId);
    if (plot !== undefined) return plot;
    const site = workOrder.siteId == null ? undefined : this.waypoints.get(workOrder.siteId);
    return site ?? null;
  }

  private elapsedIn(workOrder: WorkOrderDTO): number {
    const key = `${workOrder.id}:${workOrder.status}`;
    const since = this.seenAt.get(key);
    if (since === undefined) {
      this.seenAt.set(key, this.simClockS);
      log(`${this.name}: ${workOrder.number} is ${workOrder.status}`);
      return 0;
    }
    return this.simClockS - since;
  }

  private async workStep(workOrder: WorkOrderDTO, stepS: number): Promise<void> {
    this.patrol = null;
    const status = workOrder.status as ActiveStatus;
    const elapsed = this.elapsedIn(workOrder);
    switch (status) {
      case "ASSIGNED":
        if (elapsed >= TIMELINE.accept) await this.transition(workOrder, "accept", "ACCEPTED");
        return;
      case "ACCEPTED":
        if (elapsed >= TIMELINE.startRoute) await this.transition(workOrder, "startRoute", "EN_ROUTE");
        return;
      case "EN_ROUTE": {
        const target = this.destination(workOrder);
        const remaining = target === null ? 0 : this.moveToward(target.lat, target.lng, stepS);
        if (remaining <= ARRIVE_RADIUS_M) await this.transition(workOrder, "arrive", "ON_SITE");
        return;
      }
      case "ON_SITE":
        if (elapsed >= TIMELINE.startWork) {
          await this.photo(workOrder, "BEFORE");
          await this.transition(workOrder, "startWork", "IN_PROGRESS");
        }
        return;
      case "IN_PROGRESS":
        if (elapsed >= TIMELINE.complete) await this.complete(workOrder);
        return;
    }
  }

  private async transition(workOrder: WorkOrderDTO, action: string, next: WorkOrderDTO["status"]): Promise<void> {
    const result = await this.push("workOrder.transition", { id: workOrder.id, action });
    if (result?.status === "APPLIED") {
      this.workOrders.set(workOrder.id, { ...workOrder, status: next });
      log(`${this.name}: ${workOrder.number} ${action} → ${next}`);
    } else {
      await this.pull();
    }
  }

  /** Registers a photo on the work order and uploads its bytes through the real media pipeline. */
  private async photo(workOrder: WorkOrderDTO, mediaTag: "BEFORE" | "AFTER"): Promise<string | null> {
    const id = randomUUID();
    const registered = await this.push("media.register", {
      id,
      kind: "PHOTO",
      tag: mediaTag,
      mimeType: "image/jpeg",
      sizeBytes: PHOTO.byteLength,
      width: 8,
      height: 8,
      capturedAt: new Date().toISOString(),
      lat: this.lat,
      lng: this.lng,
      parent: { type: "WORK_ORDER", id: workOrder.id },
    });
    if (registered?.status !== "APPLIED") return null;
    try {
      const upload = await this.api.issueMediaUploadUrl(id, { variant: "original", sizeBytes: PHOTO.byteLength, mimeType: "image/jpeg" });
      if (upload.mode === "single" && upload.url !== undefined) {
        await this.api.uploadBlob(upload.url, new Uint8Array(PHOTO), "image/jpeg");
        await this.api.completeMediaUpload(id, { variant: "original" });
      }
    } catch (error) {
      log(`${this.name}: ${mediaTag} photo upload failed (the row stays registered): ${errorText(error)}`);
    }
    return id;
  }

  private answer(item: ChecklistItem, photoId: string, answeredAt: string): ChecklistResponse {
    const needsPhoto = item.photo === "ALWAYS";
    const mediaIds = needsPhoto || item.type === "PHOTO" ? [photoId] : [];
    switch (item.type) {
      case "PASS_FAIL_NA":
        return { key: item.key, value: "PASS", mediaIds, answeredAt };
      case "NUMBER": {
        const min = item.min ?? 0;
        const max = item.max ?? min + 100;
        return { key: item.key, value: Math.round((min + max) / 2), mediaIds, answeredAt };
      }
      case "SELECT":
        return { key: item.key, value: item.options?.[0]?.value ?? null, mediaIds, answeredAt };
      case "TEXT":
        return { key: item.key, value: "Conferido pelo simulador.", mediaIds, answeredAt };
      case "PHOTO":
        return { key: item.key, value: photoId, mediaIds, answeredAt };
    }
  }

  private async complete(workOrder: WorkOrderDTO): Promise<void> {
    const photoId = await this.photo(workOrder, "AFTER");
    if (photoId === null) {
      await this.pull();
      return;
    }
    const snapshot = workOrder.checklistSnapshot ?? [];
    if (snapshot.length > 0) {
      const answeredAt = new Date().toISOString();
      const saved = await this.push("workOrder.saveChecklist", {
        id: workOrder.id,
        templateVersion: workOrder.checklistTemplateVersion ?? 0,
        responses: snapshot.map((item) => this.answer(item, photoId, answeredAt)),
      });
      if (saved?.status !== "APPLIED") {
        await this.pull();
        return;
      }
    }
    const result = await this.push("workOrder.complete", {
      id: workOrder.id,
      resolution: "Serviço concluído pelo simulador de campo.",
      signatureStatus: "ABSENT",
      signatureReason: "Cliente ausente no local (simulação).",
      documentLocale: "pt-BR",
    });
    if (result?.status === "APPLIED") {
      this.completed.add(workOrder.id);
      this.workOrders.set(workOrder.id, { ...workOrder, status: "COMPLETED" });
      log(`${this.name}: ${workOrder.number} complete → COMPLETED`);
    } else {
      // Do not retry the same order every tick: park it until the next pull shows a change.
      this.completed.add(workOrder.id);
      await this.pull();
      setTimeout(() => this.completed.delete(workOrder.id), PULL_EVERY_MS * 4).unref();
    }
  }
}

// ───────── Main ─────────

async function main(): Promise<number> {
  loadRootEnv();
  const options = parseOptions();
  if (options === null) return 0;
  log(`API ${options.baseUrl}, realtime ${options.wsUrl}, speed ×${String(options.speed)}, ${String(options.users.length)} operator(s)`);

  const operators: SimulatedOperator[] = [];
  for (const email of options.users) {
    const operator = new SimulatedOperator(email, options);
    try {
      await operator.start();
      operators.push(operator);
    } catch (error) {
      log(`${tag(email)}: skipped: ${errorText(error)}`);
    }
  }
  if (operators.length === 0) {
    log("no operator could start; is `pnpm dev` running and the database seeded (`pnpm db:seed`)?");
    return 1;
  }

  let stopping = false;
  const timer = setInterval(() => {
    if (stopping) return;
    for (const operator of operators) void operator.tick();
  }, TICK_MS);

  const stop = new Promise<string>((done) => {
    const onSignal = (signal: NodeJS.Signals): void => {
      if (stopping) {
        log(`second ${signal}: exiting without waiting`);
        process.exit(130);
      }
      done(signal);
    };
    process.on("SIGINT", onSignal);
    process.on("SIGTERM", onSignal);
    if (options.durationS !== null) setTimeout(() => done(`--duration ${String(options.durationS)}s`), options.durationS * 1000).unref();
  });

  const reason = await stop;
  stopping = true;
  clearInterval(timer);
  log(`stopping (${reason}); setting operators OFF_DUTY`);
  await Promise.all(
    operators.map(async (operator) => {
      const done = await withTimeout(
        operator.stop().then(() => true),
        SHUTDOWN_TIMEOUT_MS,
      ).catch((error: unknown) => {
        log(`${operator.name}: OFF_DUTY failed: ${errorText(error)}`);
        return false;
      });
      if (done === null) log(`${operator.name}: OFF_DUTY timed out`);
    }),
  );
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    log(`failed: ${errorText(error)}`);
    process.exit(1);
  },
);
