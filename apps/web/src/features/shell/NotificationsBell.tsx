"use client";

import { useQuery } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { api } from "@/lib/api";

interface NotificationList {
  readonly items: readonly { id: string }[];
}

export function NotificationsBell() {
  const t = useTranslations("admin");
  const query = useQuery({ queryKey: ["notifications", { unread: true }], queryFn: () => api<NotificationList>("/notifications", { query: { unread: true } }), refetchInterval: 60_000, retry: false });
  const count = query.data?.items.length ?? 0;
  return (
    <Link aria-label={t("shell.notificationsLabel", { count })} className="relative flex size-12 items-center justify-center rounded-controls hover:bg-[var(--ar-surface-muted)]" href="/notifications">
      <Bell aria-hidden="true" className="size-5" />
      {count > 0 ? (
        <span aria-hidden="true" className="absolute right-1 top-1 min-w-5 rounded-full bg-[var(--ar-danger)] px-1 text-center text-xs font-bold text-white">
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </Link>
  );
}

export function useAttentionCount(enabled: boolean): number {
  const query = useQuery({ queryKey: ["attention", { count: true }], queryFn: () => api<{ items: readonly unknown[] }>("/attention"), refetchInterval: 60_000, retry: false, enabled });
  return query.data?.items.length ?? 0;
}
