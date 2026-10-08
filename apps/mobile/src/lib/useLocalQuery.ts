import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createStore } from "zustand/vanilla";

import type { SqlDb } from "../db/sql";
import { syncStore } from "../sync/store";
import { servicesStore } from "./services";

/** Bumped after local writes so screens re-read the local database. */
export const localDataStore = createStore<{ version: number }>()(() => ({ version: 0 }));

export function bumpLocalData(): void {
  localDataStore.setState((state) => ({ version: state.version + 1 }));
}

export type LocalQueryState<T> =
  | { readonly status: "loading"; readonly data: undefined; readonly error: undefined }
  | { readonly status: "ready"; readonly data: T; readonly error: undefined }
  | { readonly status: "error"; readonly data: undefined; readonly error: unknown };

/**
 * Reads the local SQLite mirror and re-reads after every sync, local write or `reload()`.
 * Screens map the result to the four states (loading, empty, error, ready).
 */
export function useLocalQuery<T>(query: (db: SqlDb) => Promise<T>, deps: readonly unknown[] = []): LocalQueryState<T> & { readonly reload: () => void } {
  const db = useSyncExternalStore(servicesStore.subscribe, () => servicesStore.getState().db);
  const version = useSyncExternalStore(localDataStore.subscribe, () => localDataStore.getState().version);
  const lastSyncAt = useSyncExternalStore(syncStore.subscribe, () => syncStore.getState().lastSyncAt);
  const pending = useSyncExternalStore(syncStore.subscribe, () => syncStore.getState().pendingMutations + syncStore.getState().pendingUploads);
  const [tick, setTick] = useState(0);
  const [state, setState] = useState<LocalQueryState<T>>({ status: "loading", data: undefined, error: undefined });
  const queryRef = useRef(query);
  queryRef.current = query;

  useEffect(() => {
    if (db === undefined) return undefined;
    let cancelled = false;
    queryRef.current(db).then(
      (data) => {
        if (!cancelled) setState({ status: "ready", data, error: undefined });
      },
      (error: unknown) => {
        if (!cancelled) setState({ status: "error", data: undefined, error });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [db, version, lastSyncAt, pending, tick, ...deps]);

  const reload = useCallback(() => setTick((value) => value + 1), []);
  return { ...state, reload };
}
