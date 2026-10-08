"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

export type UrlState<K extends string> = Readonly<Record<K, string>>;

/** Pure merge used by `useUrlState`: empty values remove the key so URLs stay short. */
export function mergeSearch(current: string, patch: Readonly<Record<string, string | null | undefined>>): string {
  const next = new URLSearchParams(current);
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === null || value === "") next.delete(key);
    else next.set(key, value);
  }
  if (!Object.prototype.hasOwnProperty.call(patch, "cursor")) next.delete("cursor");
  return next.toString();
}

export function readUrlState<K extends string>(params: URLSearchParams, keys: readonly K[], defaults: Partial<Record<K, string>>): UrlState<K> {
  const out = {} as Record<K, string>;
  for (const key of keys) out[key] = params.get(key) ?? defaults[key] ?? "";
  return out;
}

/** `nuqs`-style filters synced to the URL (A§14.2). Changing a filter resets the cursor. */
export function useUrlState<K extends string>(keys: readonly K[], defaults: Partial<Record<K, string>> = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const search = params.toString();

  const state = useMemo(() => readUrlState(new URLSearchParams(search), keys, defaults), [search, keys, defaults]);

  const set = useCallback(
    (patch: Partial<Record<K | "cursor", string | null>>) => {
      const next = mergeSearch(search, patch);
      router.replace(next.length > 0 ? `${pathname}?${next}` : pathname, { scroll: false });
    },
    [router, pathname, search],
  );

  return [state, set] as const;
}
