"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowDownToLine, ArrowUpFromLine, CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

import { EmptyState, LoadingState } from "@/components/data/States";
import { ErrorAlert } from "@/components/recovery/ErrorAlert";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { DEFAULT_TIME_ZONE, formatDate, formatDateTime } from "@/lib/format";

import { barPosition, calendarWindow, groupByAsset, shiftDay, type CalendarItem } from "./types";

export const CALENDAR_DAYS = 28;

/** Today as `YYYY-MM-DD` in the organisation time zone. */
export function todayIn(timeZone = DEFAULT_TIME_ZONE, now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/**
 * Availability calendar (RN-11, P1): one row per machine over a four-week window, one bar per
 * booking. Rent-in bookings (INBOUND) carry their own icon and outline so they never read as a
 * customer rental.
 */
export function RentalsCalendar({ anchor, assetId, onAnchor }: { readonly anchor: string; readonly assetId: string | null; readonly onAnchor: (day: string) => void }) {
  const t = useTranslations("rentals");
  const common = useTranslations("common");
  const locale = useLocale();
  const range = calendarWindow(anchor, CALENDAR_DAYS);
  const query = useQuery({
    queryKey: ["rentals", "calendar", range.from, range.to, assetId],
    queryFn: () => api<{ items: CalendarItem[] }>("/rentals/calendar", { query: { from: range.from, to: range.to, assetId: assetId ?? undefined } }),
  });
  const rows = groupByAsset(query.data?.items ?? []);
  const weeks = range.days.filter((_, i) => i % 7 === 0);

  return (
    <section aria-label={t("calendar.title")} className="flex flex-col gap-3 rounded-cards border border-[var(--ar-border)] bg-[var(--ar-surface)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <CalendarDays aria-hidden="true" className="size-5" />
          {t("calendar.range", { from: formatDate(range.days[0], locale), to: formatDate(range.days[range.days.length - 1], locale) })}
        </h2>
        <div className="flex flex-wrap gap-2">
          <Button icon={<ChevronLeft aria-hidden="true" className="size-4" />} onClick={() => onAnchor(shiftDay(anchor, -7))}>
            {t("calendar.previous")}
          </Button>
          <Button onClick={() => onAnchor(todayIn())}>{t("calendar.today")}</Button>
          <Button icon={<ChevronRight aria-hidden="true" className="size-4" />} onClick={() => onAnchor(shiftDay(anchor, 7))}>
            {t("calendar.next")}
          </Button>
        </div>
      </div>
      <ul aria-label={t("calendar.legend")} className="flex flex-wrap gap-4 text-sm">
        <li className="flex items-center gap-1">
          <ArrowUpFromLine aria-hidden="true" className="size-4" />
          {t("direction.OUTBOUND")}
        </li>
        <li className="flex items-center gap-1">
          <ArrowDownToLine aria-hidden="true" className="size-4" />
          {t("direction.INBOUND")}
        </li>
      </ul>
      {query.isLoading ? (
        <LoadingState />
      ) : query.error !== null ? (
        <ErrorAlert error={query.error} onRetry={() => void query.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState body={t("calendar.emptyBody")} icon={<CalendarDays className="size-8" />} title={t("calendar.emptyTitle")} />
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[48rem]">
            <div className="grid grid-cols-[10rem_1fr] border-b border-[var(--ar-border)] pb-1 text-sm text-[var(--ar-text-muted)]">
              <span>{t("fields.asset")}</span>
              <span className="grid grid-cols-4">
                {weeks.map((day) => (
                  <span key={day}>{formatDate(day, locale)}</span>
                ))}
              </span>
            </div>
            <ul className="flex flex-col">
              {rows.map((row) => (
                <li className="grid grid-cols-[10rem_1fr] items-center border-b border-[var(--ar-border)] py-2" key={row.assetId}>
                  <Link className="font-semibold text-[var(--ar-link)]" href={`/assets/${row.assetId}`}>
                    {row.assetCode ?? "—"}
                  </Link>
                  <ul className="relative h-12">
                    {row.items.map((item) => {
                      const pos = barPosition(item, range);
                      if (pos === null) return null;
                      const inbound = item.direction === "INBOUND";
                      const label = t("calendar.bar", {
                        number: item.number,
                        party: item.customerName ?? "—",
                        status: common(`status.rental.${item.status}`),
                        start: formatDateTime(item.start, locale),
                        end: formatDateTime(item.end, locale),
                      });
                      return (
                        <li className="absolute inset-y-0" key={item.rentalId} style={{ left: `${pos.left}%`, width: `${pos.width}%` }}>
                          <Link
                            aria-label={label}
                            className={cn(
                              "flex h-12 min-w-12 items-center gap-1 overflow-hidden rounded-cards px-2 text-sm font-semibold",
                              inbound ? "border-2 border-dashed border-[var(--ar-primary)] bg-[var(--ar-surface)]" : "bg-[var(--ar-primary)] text-[var(--ar-on-primary)]",
                              item.isOverdue ? "ring-2 ring-[var(--ar-danger)]" : null,
                            )}
                            href={`/rentals/${item.rentalId}`}
                            title={label}
                          >
                            {inbound ? <ArrowDownToLine aria-hidden="true" className="size-4 shrink-0" /> : <ArrowUpFromLine aria-hidden="true" className="size-4 shrink-0" />}
                            <span className="truncate">{item.number}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}
