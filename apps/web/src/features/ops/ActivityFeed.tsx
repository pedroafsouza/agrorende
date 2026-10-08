"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { Activity, ArrowRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { LoadingState } from "@/components/data/States";
import { ErrorAlert } from "@/components/recovery/ErrorAlert";
import { Button } from "@/components/ui/Button";
import { formatDateTime } from "@/lib/format";

import { opsApi } from "./api";
import { OPS_QUERY_KEYS, type OpsActivityItemDTO } from "./types";

/** Merges live `activity:new` items in front of the paged feed without duplicates. */
export function mergeActivity(live: readonly OpsActivityItemDTO[], paged: readonly OpsActivityItemDTO[]): readonly OpsActivityItemDTO[] {
  const seen = new Set<string>();
  const out: OpsActivityItemDTO[] = [];
  for (const item of [...live, ...paged]) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

export function ActivityFeed({ live }: { readonly live: readonly OpsActivityItemDTO[] }) {
  const t = useTranslations("ops.activity");
  const locale = useLocale();
  const query = useInfiniteQuery({
    queryKey: OPS_QUERY_KEYS.activity,
    queryFn: ({ pageParam, signal }) => opsApi.activity(pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
  const items = mergeActivity(live, query.data?.pages.flatMap((p) => p.items) ?? []);

  return (
    <section aria-labelledby="ops-activity-title" className="flex flex-col gap-2">
      <h2 className="flex items-center gap-2 text-lg font-semibold" id="ops-activity-title">
        <Activity aria-hidden="true" className="size-5" />
        {t("title")}
      </h2>
      {query.isLoading ? <LoadingState rows={4} /> : null}
      {query.error === null ? null : <ErrorAlert compact error={query.error} onRetry={() => void query.refetch()} />}
      {!query.isLoading && items.length === 0 && query.error === null ? <p className="text-sm text-[var(--ar-text-muted)]">{t("empty")}</p> : null}
      <ol aria-live="polite" className="flex flex-col divide-y divide-[var(--ar-border)]">
        {items.map((item) => (
          <li className="py-2 text-sm" key={item.id}>
            <p>
              <span className="font-semibold">{item.actorName ?? t("system")}</span> {t("action", { action: item.action, entity: item.entityType })}
            </p>
            {item.fromStatus !== null || item.toStatus !== null ? (
              <p className="flex items-center gap-1 text-xs text-[var(--ar-text-muted)]">
                {item.fromStatus ?? "—"}
                <ArrowRight aria-label={t("to")} className="size-3" />
                {item.toStatus ?? "—"}
              </p>
            ) : null}
            <time className="text-xs text-[var(--ar-text-muted)]" dateTime={item.occurredAt}>
              {formatDateTime(item.occurredAt, locale)}
            </time>
          </li>
        ))}
      </ol>
      {query.hasNextPage ? (
        <Button busy={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()} variant="secondary">
          {t("more")}
        </Button>
      ) : null}
    </section>
  );
}
