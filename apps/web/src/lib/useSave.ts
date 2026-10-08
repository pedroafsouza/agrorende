"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { isApiError } from "./api";

export interface SaveState {
  readonly busy: boolean;
  readonly error: unknown;
  readonly conflict: boolean;
  readonly reset: () => void;
}

/**
 * Wraps a write: tracks busy and error, invalidates the entity's queries on success, and
 * exposes `conflict` so the form can offer Keep mine / Use theirs (EC-OPS-05).
 */
export function useSave<A extends unknown[], R>(entity: string, write: (...args: A) => Promise<R>, onDone?: (result: R) => void) {
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const run = async (...args: A): Promise<R | undefined> => {
    setBusy(true);
    setError(null);
    try {
      const result = await write(...args);
      await client.invalidateQueries({ queryKey: [entity] });
      onDone?.(result);
      return result;
    } catch (caught) {
      setError(caught);
      return undefined;
    } finally {
      setBusy(false);
    }
  };
  const state: SaveState = { busy, error, conflict: isApiError(error, "CONFLICT"), reset: () => setError(null) };
  return [run, state] as const;
}
