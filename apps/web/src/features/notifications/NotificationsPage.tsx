"use client";

import type { NotificationDTO } from "@agrorende/contracts/dto";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Bell, Check, CheckCheck } from "lucide-react";
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

import { notificationDisplay } from "./notificationDisplay";

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
        <ul className="flex flex-col divide-y divide-[var(--ar-border)] overflow-hidden rounded-cards border border-[var(--ar-border)] bg-[var(--ar-surface)]" data-testid="notifications-list">
          {items.map((n) => {
            const unread = (n.readAt ?? null) === null;
            const href = notificationHref(n);
            const shown = notificationDisplay(n, (key, values) => t(`notifications.display.${key}`, values));
            return (
              <li className="grid grid-cols-[0.5rem_minmax(0,1fr)] sm:grid-cols-[0.5rem_minmax(0,1fr)_auto] items-start gap-x-3 px-4 py-3" data-unread={unread ? "true" : undefined} key={n.id}>
                <span aria-hidden="true" className={`mt-2 size-2 rounded-full ${unread ? "bg-[var(--ar-primary)]" : ""}`} />
                <div className="flex min-w-0 flex-col gap-1 py-1">
                  <span className={unread ? "font-semibold" : "font-medium"}>
                    {unread ? <span className="sr-only">{t("notifications.unread")} </span> : null}
                    {href === null ? (
                      shown.title
                    ) : (
                      <Link
                        className="text-[var(--ar-link)] underline-offset-2 hover:underline"
                        href={href}
                        onClick={() => {
                          if (unread) void markRead({ ids: [n.id] });
                        }}
                      >
                        {shown.title}
                      </Link>
                    )}
                  </span>
                  <span className="text-[var(--ar-text)]">{shown.body}</span>
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[var(--ar-text-muted)]">
                    {shown.reference === null ? null : (
                      <span className="rounded-[4px] border border-[var(--ar-border)] px-1.5 font-mono text-xs leading-5 whitespace-nowrap">{shown.reference}</span>
                    )}
                    <time dateTime={n.createdAt}>{formatDateTime(n.createdAt, locale)}</time>
                  </span>
                </div>
                {unread ? (
                  <Button
                    className="col-start-2 -ml-3 justify-self-start text-sm sm:col-start-3 sm:row-start-1 sm:-mr-3 sm:ml-0 sm:justify-self-end"
                    icon={<Check aria-hidden="true" className="size-4" />}
                    onClick={() => void markRead({ ids: [n.id] })}
                    variant="ghost"
                  >
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
