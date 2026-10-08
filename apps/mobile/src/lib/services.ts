import { useSyncExternalStore } from "react";
import { createStore } from "zustand/vanilla";

import type { SqlDb } from "../db/sql";
import type { FileStore } from "../media/files";

/** Per-user services set by the session bootstrap; screens and shared components read them here. */
export interface AppServices {
  readonly db?: SqlDb;
  readonly files?: FileStore;
  readonly userId?: string;
  readonly orgId?: string;
  readonly newId?: () => string;
  readonly now?: () => number;
  readonly syncNow?: () => Promise<unknown>;
  readonly kick?: () => void;
}

export const servicesStore = createStore<AppServices>()(() => ({}));

export function setServices(services: AppServices): void {
  servicesStore.setState(services, true);
}

export function useServices(): AppServices {
  return useSyncExternalStore(servicesStore.subscribe, servicesStore.getState);
}
