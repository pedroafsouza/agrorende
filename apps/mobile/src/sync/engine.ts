import type { DeviceStatus, PullResponse, PushResponse } from "@agrorende/contracts/sync";

import { notImplemented } from "../lib/notImplemented";

export type SyncEngine = { readonly kick: () => void; readonly push: () => Promise<PushResponse | undefined>; readonly pull: () => Promise<PullResponse | undefined>; readonly status: () => DeviceStatus };
export function createSyncEngine(): SyncEngine { return notImplemented("sync.createSyncEngine"); }
