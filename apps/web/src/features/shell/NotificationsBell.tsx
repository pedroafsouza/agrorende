"use client";

import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";

/** The bell opens the notifications popover; the full list stays on /notifications. */
export { NotificationsFlyout as NotificationsBell } from "@/features/notifications/flyout/NotificationsFlyout";

export function useAttentionCount(enabled: boolean): number {
  const query = useQuery({ queryKey: ["attention", { count: true }], queryFn: () => api<{ items: readonly unknown[] }>("/attention"), refetchInterval: 60_000, retry: false, enabled });
  return query.data?.items.length ?? 0;
}
