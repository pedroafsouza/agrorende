import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

import type { LoginResponse } from "@agrorende/api-client";
import { SLOW_LINK_BYTES_PER_SECOND } from "@agrorende/contracts/sync";

import { createAuthSession, createAuthStore, type AuthSession, type AuthStore, type CachedProfile } from "../../../src/auth/session";
import { memoryTokenVault } from "../../../src/auth/vault";
import { openUserDatabase, type DatabaseHost, type OpenedDatabase } from "../../../src/db/client";
import type { MigrationBundle } from "../../../src/db/migrate";
import type { SqlDb } from "../../../src/db/sql";
import { flushViaRest, maintainLocationBuffer } from "../../../src/location/buffer";
import { drainMediaQueue, pruneMediaFiles } from "../../../src/media/queue";
import { createSyncEngine, type SyncCycleResult, type SyncEngine } from "../../../src/sync/engine";
import "../../../src/sync/mutators";
import { createSyncRuntime, type SyncRuntime } from "../../../src/sync/runtime";
import { createSyncStore, type SyncStore } from "../../../src/sync/store";
import { createHttpTransport, type FetchLike, type SyncApi } from "../../../src/sync/transport";
import { nodeDriver } from "../../helpers/nodeSqlite";
import { ChaosFiles } from "./files";
import { BASE, DEVICES_ROOT, emailOf, SEED, type ChaosServer } from "./harness";

export interface ChaosClock {
  now(): number;
  advance(ms: number): void;
  /** Device clock offset from the real (server) clock. */
  offsetMs: number;
}

export function chaosClock(offsetMs = 0): ChaosClock {
  const clock = {
    offsetMs,
    now: () => Date.now() + clock.offsetMs,
    advance: (ms: number) => {
      clock.offsetMs += ms;
    },
  };
  return clock;
}

let deviceSeq = 0;

/** File-backed SQLite host under `.data/media-t12/devices/<name>`, so "kill" and "restart" are real. */
export function fileHost(dir: string): DatabaseHost {
  return {
    async open(fileName) {
      await mkdir(dir, { recursive: true });
      return nodeDriver(path.join(dir, fileName));
    },
    async removeFile(file) {
      await rm(file, { force: true });
    },
  };
}

export interface OpenOptions {
  readonly bundle?: MigrationBundle;
}

/**
 * One simulated phone: a token vault and profile cache that survive "kills", one SQLite file per
 * user, the real auth session, HTTP transport, sync runtime, engine and media queue.
 */
export class ChaosDevice {
  readonly deviceId: string;
  readonly dir: string;
  readonly files: ChaosFiles;
  readonly clock: ChaosClock;
  readonly vault = memoryTokenVault();
  readonly profiles = new Map<string, CachedProfile>();
  authStore: AuthStore = createAuthStore();
  auth: AuthSession;
  store: SyncStore = createSyncStore();
  db?: SqlDb;
  opened?: OpenedDatabase;
  api?: SyncApi;
  runtime?: SyncRuntime;
  engine?: SyncEngine;
  userId?: string;
  /** When false every request from this device fails like airplane mode. */
  online = true;
  random: () => number = () => 0.5;

  constructor(
    readonly server: ChaosServer,
    readonly name: string,
    options: { readonly clock?: ChaosClock; readonly deviceId?: string } = {},
  ) {
    deviceSeq += 1;
    this.deviceId = options.deviceId ?? `018fd000-0000-7000-8000-${(0xc0000 + deviceSeq).toString(16).padStart(12, "0")}`;
    this.dir = path.join(DEVICES_ROOT, name);
    this.files = new ChaosFiles(this.deviceId);
    this.clock = options.clock ?? chaosClock();
    this.auth = this.createAuth();
  }

  readonly fetch: FetchLike = async (url, init) => {
    if (!this.online) throw new TypeError("fetch failed");
    const headers = { ...((init?.headers as Record<string, string> | undefined) ?? {}), "x-chaos-device": this.deviceId };
    return fetch(url, { ...(init as RequestInit), headers }) as unknown as ReturnType<FetchLike>;
  };

  private createAuth(): AuthSession {
    return createAuthSession({
      store: this.authStore,
      vault: this.vault,
      now: () => this.clock.now(),
      loadProfile: async (userId) => this.profiles.get(userId),
      saveProfile: async (profile) => {
        this.profiles.set(profile.user.id, profile);
      },
      api: {
        refresh: async (body) => {
          const response = await this.fetch(`${BASE}/api/v1/auth/refresh`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, deviceId: this.deviceId }) });
          const parsed = JSON.parse(await response.text()) as LoginResponse & { error?: { code: string } };
          if (response.status >= 400) throw Object.assign(new Error(parsed.error?.code ?? "refresh failed"), { status: response.status, code: parsed.error?.code });
          return parsed;
        },
      },
    });
  }

  /** Online login against the real `/auth/login`; opens (or reopens) that user's database. */
  async login(userId: string = SEED.field): Promise<LoginResponse> {
    const email = await emailOf(this.server, userId);
    const response = await this.fetch(`${BASE}/api/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: SEED.password, deviceId: this.deviceId, platform: "ANDROID" }),
    });
    const parsed = JSON.parse(await response.text()) as LoginResponse;
    if (response.status !== 200) throw new Error(`login failed ${response.status} ${JSON.stringify(parsed)}`);
    await this.auth.completeLogin(parsed);
    if (this.userId !== parsed.user.id) {
      await this.close();
      await this.open(parsed.user.id);
    }
    return parsed;
  }

  /** Opens the user's SQLite file and wires runtime + engine like `lib/app/session.ts`. */
  async open(userId: string, options: OpenOptions = {}): Promise<void> {
    this.opened = await openUserDatabase({ userId, host: fileHost(this.dir), ...(options.bundle === undefined ? {} : { bundle: options.bundle }) });
    this.db = this.opened.db;
    this.userId = userId;
    this.store = createSyncStore();
    this.api = createHttpTransport({
      baseUrl: BASE,
      fetch: this.fetch,
      getAccessToken: () => this.auth.accessToken(),
      onUnauthorized: () => this.auth.refresh(),
      timeoutMs: 2_000,
    });
    const db = this.db;
    const api = this.api;
    this.runtime = createSyncRuntime({ db, api, deviceId: this.deviceId, userId, store: this.store, clock: this.clock, random: () => this.random() });
    this.engine = createSyncEngine(this.runtime, {
      media: async () => {
        const store = this.store;
        await drainMediaQueue({
          db,
          api,
          files: this.files,
          now: () => this.clock.now(),
          random: () => this.random(),
          isWifi: async () => this.files.wifi,
          slowLink: () => store.getState().slowLink,
          onThroughput: (bytesPerSecond) => store.setState({ slowLink: bytesPerSecond < SLOW_LINK_BYTES_PER_SECOND }),
        });
        await pruneMediaFiles(db, this.files, this.clock.now(), await this.files.freeBytes());
      },
      location: async () => {
        const trimmed = await maintainLocationBuffer(db, this.clock.now());
        if (trimmed > 0) this.store?.setState({ locationTrimmed: trimmed });
        await flushViaRest(db, api, this.deviceId, new Date(this.clock.now()).toISOString());
      },
      refreshAuth: () => this.auth.ensureFreshToken(),
    });
    await this.engine.start();
  }

  /** Process death: engine and DB handle gone; vault, profile cache and files survive. */
  async kill(): Promise<void> {
    await this.close();
    this.authStore = createAuthStore();
    this.auth = this.createAuth();
  }

  /** Cold start: restore the last user from the vault and reopen their database. */
  async restart(options: OpenOptions = {}): Promise<void> {
    await this.auth.restore();
    const user = this.authStore.getState().user;
    if (user === undefined) throw new Error("no user to restore");
    await this.open(user.id, options);
  }

  async close(): Promise<void> {
    this.engine?.dispose();
    await this.db?.close().catch(() => undefined);
    this.engine = undefined;
    this.db = undefined;
    this.runtime = undefined;
    this.userId = undefined;
  }

  async signOut(): Promise<void> {
    await this.auth.signOut();
    await this.close();
  }

  sync(): Promise<SyncCycleResult> {
    if (this.engine === undefined) throw new Error("device closed");
    return this.engine.syncNow("manual");
  }

  /** Runs cycles (advancing the clock past backoff) until the outbox and media queue are empty. */
  async syncUntilIdle(maxCycles = 12, stepMs = 31 * 60_000): Promise<SyncCycleResult> {
    let result = await this.sync();
    for (let i = 0; i < maxCycles; i += 1) {
      const pending = await this.count("SELECT COUNT(*) AS n FROM outbox WHERE status IN ('PENDING','IN_FLIGHT')");
      const media = await this.count("SELECT COUNT(*) AS n FROM media_files WHERE state IN ('QUEUED','UPLOADING','UPLOADED','WAITING_PARENT')");
      if (pending === 0 && media === 0 && result.ok) return result;
      this.clock.advance(stepMs);
      result = await this.sync();
    }
    return result;
  }

  get sqlDb(): SqlDb {
    if (this.db === undefined) throw new Error("device closed");
    return this.db;
  }

  get rt(): SyncRuntime {
    if (this.runtime === undefined) throw new Error("device closed");
    return this.runtime;
  }

  async count(sql: string, params: readonly (string | number | null)[] = []): Promise<number> {
    const rows = await this.sqlDb.all(sql, params);
    return Number(rows[0]?.n ?? 0);
  }

  async destroy(): Promise<void> {
    await this.close();
    await rm(this.dir, { recursive: true, force: true });
  }
}
