"use client";

import { History } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { formatDateTime } from "@/lib/format";

export interface TimelineEntry {
  readonly id: string;
  readonly action: string;
  readonly actorName?: string | null;
  readonly createdAt: string;
  readonly summary?: string | null;
}

/** Activity log rendered newest first (A§14.2). Unknown actions fall back to the raw action name. */
export function EntityTimeline({ entries, timeZone }: { readonly entries: readonly TimelineEntry[]; readonly timeZone?: string }) {
  const t = useTranslations("common");
  const locale = useLocale();
  if (entries.length === 0) return <p className="text-[var(--ar-text-muted)]">{t("timeline.empty")}</p>;
  return (
    <ol className="flex flex-col gap-3 border-l-2 border-[var(--ar-border)] pl-4">
      {entries.map((entry) => (
        <li className="relative" key={entry.id}>
          <span aria-hidden="true" className="absolute -left-[1.6rem] top-1 flex size-5 items-center justify-center rounded-full bg-[var(--ar-surface)]">
            <History className="size-4 text-[var(--ar-text-muted)]" />
          </span>
          <p className="font-semibold">{t.has(`activity.${entry.action}`) ? t(`activity.${entry.action}`) : entry.action}</p>
          <p className="text-sm text-[var(--ar-text-muted)]">
            {formatDateTime(entry.createdAt, locale, timeZone)}
            {entry.actorName === null || entry.actorName === undefined ? null : ` · ${entry.actorName}`}
          </p>
          {entry.summary === null || entry.summary === undefined ? null : <p className="text-sm">{entry.summary}</p>}
        </li>
      ))}
    </ol>
  );
}
