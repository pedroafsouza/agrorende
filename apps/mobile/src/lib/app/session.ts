import { AgrorendeApiClient } from "@agrorende/api-client";
import NetInfo from "@react-native-community/netinfo";
import * as Application from "expo-application";
import { Platform } from "react-native";
import { uuidv7 } from "uuidv7";

import { authStore, createAuthSession, type AuthSession } from "../../auth/session";
import { secureTokenVault } from "../../auth/secureVault";
import { openUserDatabase } from "../../db/client";
import { expoDatabaseHost } from "../../db/expoDriver";
import type { SqlDb } from "../../db/sql";
import { initI18n, type AppLocale } from "../../i18n/runtime";
import { flushViaRest, flushViaSocket } from "../../location/buffer";
import { setLocationBufferDb } from "../../location/tracker";
import { expoFileStore } from "../../media/expoFiles";
import { drainMediaQueue } from "../../media/queue";
import { createRealtimeClient, type RealtimeClient } from "../../realtime/client";
import { socketIoFactory } from "../../realtime/socketIo";
import { registerBackgroundSync, setBackgroundSyncEngine } from "../../sync/backgroundTask";
import { enqueueDiagnostic, uploadDiagnostics } from "../../sync/diagnostics";
import { createSyncEngine, type SyncEngine } from "../../sync/engine";
import "../../sync/mutators";
import { nativeTriggerSources } from "../../sync/nativeTriggers";
import { createSyncRuntime, setSyncRuntime, type SyncRuntime } from "../../sync/runtime";
import { readSyncState, SYNC_STATE_KEYS } from "../../sync/state";
import { syncStore } from "../../sync/store";
import { createHttpTransport, type FetchLike } from "../../sync/transport";
import { registerSyncTriggers, type SyncTriggerSubscription } from "../../sync/triggers";
import { configureRecovery, type OfficeContact } from "../../ui/recovery/config";
import { LocalError } from "../errors";
import { setServices } from "../services";
import { appConfig } from "./config";
import { loadCachedProfile, saveCachedProfile } from "./profileCache";

export interface UserSession {
  readonly userId: string;
  readonly db: SqlDb;
  readonly runtime: SyncRuntime;
  readonly engine: SyncEngine;
  readonly realtime: RealtimeClient;
  readonly close: () => Promise<void>;
}

let deviceId = "";
let auth: AuthSession | undefined;
let api: AgrorendeApiClient | undefined;
let current: UserSession | undefined;
let opening: Promise<UserSession> | undefined;
let started: Promise<void> | undefined;

export const platform: "IOS" | "ANDROID" = Platform.OS === "ios" ? "IOS" : "ANDROID";

export function getAuthSession(): AuthSession {
  if (auth === undefined) throw new Error("app not started");
  return auth;
}

export function getApiClient(): AgrorendeApiClient {
  if (api === undefined) throw new Error("app not started");
  return api;
}

export function getDeviceId(): string {
  return deviceId;
}

export function getUserSession(): UserSession | undefined {
  return current;
}

async function isWifi(): Promise<boolean> {
  const state = await NetInfo.fetch();
  return state.type === "wifi" || state.type === "ethernet";
}

async function openSession(userId: string): Promise<UserSession> {
  const opened = await openUserDatabase({ userId, host: expoDatabaseHost });
  const db = opened.db;
  const transport = createHttpTransport({
    baseUrl: appConfig.apiUrl,
    fetch: fetch as unknown as FetchLike,
    getAccessToken: () => auth?.accessToken(),
    onUnauthorized: () => auth?.refresh() ?? Promise.resolve(false),
  });
  const engineRef: { current?: SyncEngine } = {};
  const runtime = createSyncRuntime({
    db,
    api: transport,
    deviceId,
    userId,
    store: syncStore,
    kick: () => engineRef.current?.kick("mutation"),
    deviceInfo: async () => ({ appVersion: Application.nativeApplicationVersion ?? "0.0.0", runtimeVersion: Application.nativeBuildVersion ?? "0", freeStorageBytes: await expoFileStore.freeBytes() }),
  });
  setSyncRuntime(runtime);
  const realtime = createRealtimeClient({
    url: appConfig.wsUrl,
    factory: socketIoFactory,
    getToken: async () => {
      await auth?.ensureFreshToken();
      return auth?.accessToken() ?? "";
    },
    handlers: { onSyncPoke: () => engineRef.current?.kick("poke") },
  });
  const created = createSyncEngine(runtime, {
    media: async () => {
      await drainMediaQueue({ db, api: transport, files: expoFileStore, now: Date.now, isWifi });
    },
    location: async () => {
      const now = new Date().toISOString();
      if (realtime.isConnected()) await flushViaSocket(db, realtime.emitLocationBatch, now);
      await flushViaRest(db, transport, deviceId, now);
      await uploadDiagnostics(runtime).catch(() => undefined);
    },
    refreshAuth: () => auth?.ensureFreshToken() ?? Promise.resolve(false),
  });
  engineRef.current = created;
  await created.start();
  const triggers: SyncTriggerSubscription = registerSyncTriggers(created, nativeTriggerSources());
  setBackgroundSyncEngine(created);
  registerBackgroundSync().catch(() => undefined);
  setLocationBufferDb(db);
  realtime.connect();

  const office = await readSyncState(db, SYNC_STATE_KEYS.officeContact).then((raw) => (raw === undefined ? undefined : (JSON.parse(raw) as OfficeContact))).catch(() => undefined);
  configureRecovery({
    office: office ?? (appConfig.supportWhatsapp === undefined ? undefined : { whatsapp: appConfig.supportWhatsapp }),
    sendDiagnostics: async (context) => {
      await enqueueDiagnostic(db, { id: uuidv7(), payload: { kind: "user-report", ...context }, nowMs: Date.now() });
      await uploadDiagnostics(runtime);
    },
    recordCrash: (error, screen) => {
      enqueueDiagnostic(db, { id: uuidv7(), payload: { kind: "crash", code: "SCREEN_CRASHED", screen, message: error.message.slice(0, 200) }, nowMs: Date.now() }).catch(() => undefined);
    },
  });
  setServices({ db, files: expoFileStore, userId, newId: uuidv7, now: Date.now, syncNow: () => created.syncNow("manual"), kick: () => created.kick("manual") });
  created.kick("start");

  return {
    userId,
    db,
    runtime,
    engine: created,
    realtime,
    close: async () => {
      triggers.remove();
      realtime.disconnect();
      created.dispose();
      setBackgroundSyncEngine(undefined);
      setLocationBufferDb(undefined);
      setSyncRuntime(undefined);
      setServices({});
      await db.close();
    },
  };
}

/** Opens (or switches to) the per-user database and services; same user → same DB (PLT-12). */
export async function ensureUserSession(userId: string): Promise<UserSession> {
  if (current?.userId === userId) return current;
  if (opening !== undefined) return opening;
  opening = (async () => {
    if (current !== undefined) {
      await current.close();
      current = undefined;
    }
    current = await openSession(userId);
    return current;
  })().finally(() => {
    opening = undefined;
  });
  return opening;
}

export async function closeUserSession(): Promise<void> {
  const session = current;
  current = undefined;
  await session?.close();
}

/** One-time app start: i18n, device id, API client, auth restore and the user's session. */
export function startApp(initialLocale: AppLocale): Promise<void> {
  if (started !== undefined) return started;
  started = (async () => {
    initI18n(initialLocale);
    const stored = await secureTokenVault.getDeviceId();
    deviceId = stored ?? uuidv7();
    if (stored === undefined) await secureTokenVault.setDeviceId(deviceId);
    api = new AgrorendeApiClient({
      baseUrl: appConfig.apiUrl,
      tokenProvider: () => auth?.accessToken() ?? null,
      onUnauthorized: () => auth?.refresh() ?? Promise.resolve(false),
    });
    const client = api;
    auth = createAuthSession({
      store: authStore,
      vault: secureTokenVault,
      api: { refresh: (body) => client.refresh(body), logout: async () => client.logout() },
      now: Date.now,
      loadProfile: loadCachedProfile,
      saveProfile: saveCachedProfile,
    });
    const status = await auth.restore();
    const user = authStore.getState().user;
    if (status === "signedIn" && user !== undefined) {
      await ensureUserSession(user.id).catch((error: unknown) => {
        throw error instanceof LocalError ? error : new LocalError("LOCAL_DB_REPAIR_REQUIRED", { cause: error });
      });
      auth.refresh().catch(() => undefined);
    }
  })();
  return started;
}
