"use client";

import type { NotificationDTO } from "@agrorende/contracts/dto";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Bell, CheckCheck } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

import { EmptyState, LoadingState } from "@/components/data/States";
import { ErrorAlert } from "@/components/recovery/ErrorAlert";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Field";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type { ListPage } from "@/lib/forms";
import { useSave } from "@/lib/useSave";
import { useUrlState } from "@/lib/url-state";

const ENTITY_PATHS: Partial<Record<string, string>> = {
  WORK_ORDER: "/work-orders",
  RENTAL: "/rentals",
  FIELD_REPORT: "/reports",
  ASSET: "/assets",
  CUSTOMER: "/customers",
  SITE: "/sites",
};

/** Deep link for a notification; unknown entity types fall back to no link rather than a 404. */
export function notificationHref(n: Pick<NotificationDTO, "entityType" | "entityId">): string | null {
  if (n.entityType === null || n.entityType === undefined || n.entityId === null || n.entityId === undefined) return null;
  const base = ENTITY_PATHS[n.entityType];
  return base === undefined ? null : `${base}/${n.entityId}`;
}

const KEYS = ["unread"] as const;

export function NotificationsPage() {
  const t = useTranslations("admin");
  const locale = useLocale();
  const [filters, setFilters] = useUrlState(KEYS);
  const query = useInfiniteQuery({
    queryKey: ["notifications", "list", filters],
    queryFn: ({ pageParam }) => api<ListPage<NotificationDTO>>("/notifications", { query: { unread: filters.unread === "true" ? "true" : undefined, cursor: pageParam ?? undefined, limit: 50 } }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const [markRead, markState] = useSave("notifications", (body: { ids: string[] } | { all: true }) => api("/notifications/read", { method: "POST", body }));
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        actions={
          <Button busy={markState.busy} disabled={items.every((n) => (n.readAt ?? null) !== null)} icon={<CheckCheck aria-hidden="true" className="size-4" />} onClick={() => void markRead({ all: true })}>
            {t("notifications.markAllRead")}
          </Button>
        }
        title={t("notifications.title")}
      />
      <Checkbox checked={filters.unread === "true"} label={t("notifications.unreadOnly")} onChange={(e) => setFilters({ unread: e.target.checked ? "true" : null })} />
      {markState.error === null ? null : <ErrorAlert error={markState.error} />}
      {query.isLoading ? (
        <LoadingState />
      ) : query.error !== null ? (
        <ErrorAlert error={query.error} onRetry={() => void query.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState body={t("notifications.emptyBody")} icon={<Bell className="size-8" />} title={t("notifications.emptyTitle")} />
      ) : (
        <ul className="flex flex-col divide-y divide-[var(--ar-border)] rounded-cards border border-[var(--ar-border)] bg-[var(--ar-surface)]">
          {items.map((n) => {
            const unread = (n.readAt ?? null) === null;
            const href = notificationHref(n);
            return (
              <li className={`flex flex-wrap items-start gap-3 p-4 ${unread ? "bg-[var(--ar-info-bg)]" : ""}`} key={n.id}>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="font-semibold">
                    {unread ? <span className="sr-only">{t("notifications.unread")} </span> : null}
                    {href === null ? n.title : <Link className="text-[var(--ar-link)] underline-offset-2 hover:underline" href={href} onClick={() => { if (unread) void markRead({ ids: [n.id] }); }}>{n.title}</Link>}
                  </span>
                  <span>{n.body}</span>
                  <span className="text-sm text-[var(--ar-text-muted)]">{formatDateTime(n.createdAt, locale)}</span>
                </div>
                {unread ? (
                  <Button onClick={() => void markRead({ ids: [n.id] })} variant="ghost">
                    {t("notifications.markRead")}
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {query.hasNextPage ? (
        <Button busy={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
          {t("notifications.more")}
        </Button>
      ) : null}
    </div>
  );
}
