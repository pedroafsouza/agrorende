"use client";

import { useQuery } from "@tanstack/react-query";
import { Clock, MapPinned, Smartphone, X } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

import { ErrorAlert } from "@/components/recovery/ErrorAlert";
import { Badge, type Tone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatDateTime } from "@/lib/format";

import { opsApi } from "./api";
import { trailHasGaps } from "./filters";
import { initials, type OperatorMarker } from "./operatorStore";
import { OPS_QUERY_KEYS } from "./types";

const STATE_TONE: Readonly<Record<OperatorMarker["state"], Tone>> = { WORKING: "primary", EN_ROUTE: "info", ON_SITE: "info", ON_HOLD: "warning", IDLE: "neutral", OFFLINE: "neutral" };

export function OperatorStateBadge({ marker }: { readonly marker: OperatorMarker }) {
  const t = useTranslations("ops.operators");
  return (
    <Badge tone={marker.stale ? "warning" : STATE_TONE[marker.state]}>
      {marker.stale ? t("staleTag") : t(`state.${marker.state}`)}
    </Badge>
  );
}

/** EC-OPS-20: last known position with its time and a link to the device sync health. */
export function StaleOperatorBanner({ marker }: { readonly marker: OperatorMarker }) {
  const t = useTranslations("ops");
  const locale = useLocale();
  const last = Math.max(Date.parse(marker.recordedAt) || 0, marker.lastSeenAt === null ? 0 : Date.parse(marker.lastSeenAt) || 0);
  return (
    <div className="rounded-controls border-2 border-[var(--ar-warning)] bg-[var(--ar-warning-bg)] p-3 text-[var(--ar-text)]" role="status">
      <p className="flex items-center gap-2 font-semibold">
        <Clock aria-hidden="true" className="size-4 shrink-0" />
        {t("errors.OPERATOR_STALE.title")}
      </p>
      <p className="mt-1 text-sm">{t("errors.OPERATOR_STALE.body")}</p>
      <p className="mt-1 text-sm">{t("operators.lastUpdate", { at: formatDateTime(new Date(last).toISOString(), locale) })}</p>
      <Link
        className="mt-2 inline-flex min-h-12 items-center gap-2 text-sm font-semibold text-[var(--ar-link)] underline"
        href={marker.deviceId === null ? `/team/devices?user=${encodeURIComponent(marker.userId)}` : `/team/devices?device=${encodeURIComponent(marker.deviceId)}`}
      >
        <Smartphone aria-hidden="true" className="size-4" />
        {t("operators.deviceHealth")}
      </Link>
    </div>
  );
}

export function OperatorList({ operators, selected, onSelect }: { readonly operators: readonly OperatorMarker[]; readonly selected: string | null; readonly onSelect: (userId: string) => void }) {
  const t = useTranslations("ops.operators");
  return (
    <section aria-labelledby="ops-operators-title" className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold" id="ops-operators-title">
        {t("title", { count: operators.length })}
      </h2>
      <ul className="flex max-h-80 flex-col gap-1 overflow-auto">
        {operators.map((o) => (
          <li key={o.userId}>
            <button
              aria-pressed={selected === o.userId}
              className="flex min-h-12 w-full items-center gap-3 rounded-controls px-2 text-left hover:bg-[var(--ar-surface-muted)] aria-pressed:bg-[var(--ar-primary-bg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ar-focus)]"
              onClick={() => onSelect(o.userId)}
              type="button"
            >
              <span aria-hidden="true" className={`flex size-9 shrink-0 items-center justify-center rounded-full border-4 text-xs font-bold ${o.stale ? "border-dashed border-[var(--ar-text-muted)] opacity-70" : "border-[var(--ar-primary)]"}`}>
                {initials(o.name)}
              </span>
              <span className="min-w-0 flex-1 truncate font-medium">{o.name}</span>
              <OperatorStateBadge marker={o} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function OperatorPanel({ marker, onClose }: { readonly marker: OperatorMarker; readonly onClose: () => void }) {
  const t = useTranslations("ops.operators");
  const locale = useLocale();
  const trail = useQuery({
    queryKey: OPS_QUERY_KEYS.trail(marker.userId),
    queryFn: ({ signal }) => opsApi.trail(marker.userId, signal),
    retry: false,
  });
  return (
    <section aria-labelledby="ops-operator-title" className="flex flex-col gap-3 rounded-cards border border-[var(--ar-border)] bg-[var(--ar-surface)] p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold" id="ops-operator-title">
            {marker.name}
          </h2>
          <p className="text-sm text-[var(--ar-text-muted)]">{t("lastFix", { at: formatDateTime(marker.recordedAt, locale) })}</p>
        </div>
        <Button aria-label={t("close")} icon={<X aria-hidden="true" className="size-5" />} onClick={onClose} size="icon" variant="ghost" />
      </div>
      <div className="flex flex-wrap gap-2">
        <OperatorStateBadge marker={marker} />
        <Badge tone={marker.dutyStatus === "ON_DUTY" ? "success" : "neutral"}>{t(`duty.${marker.dutyStatus}`)}</Badge>
      </div>
      {marker.stale ? <StaleOperatorBanner marker={marker} /> : null}
      {marker.activeWorkOrderId === null ? null : (
        <Link className="inline-flex min-h-12 items-center gap-2 font-semibold text-[var(--ar-link)] underline" href={`/work-orders/${marker.activeWorkOrderId}`}>
          {t("activeWorkOrder")}
        </Link>
      )}
      <div>
        <h3 className="flex items-center gap-2 font-semibold">
          <MapPinned aria-hidden="true" className="size-4" />
          {t("trail")}
        </h3>
        {trail.error === null ? null : <ErrorAlert compact error={trail.error} onRetry={() => void trail.refetch()} />}
        {trail.data === undefined ? null : (
          <p className="text-sm text-[var(--ar-text-muted)]">
            {trail.data.points.length === 0 ? t("trailEmpty") : t("trailPoints", { count: trail.data.points.length })}
            {trailHasGaps(trail.data.points) ? ` ${t("trailGaps")}` : ""}
          </p>
        )}
      </div>
    </section>
  );
}
