import { notImplemented } from "../lib/notImplemented";

export type SyncTriggerSubscription = { readonly remove: () => void };
export function registerSyncTriggers(): SyncTriggerSubscription { return notImplemented("sync.registerSyncTriggers"); }
