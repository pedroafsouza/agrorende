"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, BatteryLow, BellOff, Clock, FileSearch } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { SyncHealthBadge, syncHealthOf } from "@/components/data/badges";
import { EmptyState, LoadingState } from "@/components/data/States";
import { ErrorAlert } from "@/components/recovery/ErrorAlert";
import { Badge } from "@/components/ui/Badge";
import { api } from "@/lib/api";
import { formatDateTime, formatNumber } from "@/lib/format";

import { CLOCK_WARN_MS, type DeviceDiagnostic, type TeamDevice } from "./types";

/** Warnings derived from the last device status push (OFF-11, PLT-19, PLT-20, PLT-22). */
export function deviceWarnings(device: TeamDevice): ("push" | "battery" | "clock" | "pending")[] {
  const out: ("push" | "battery" | "clock" | "pending")[] = [];
  if (device.pushStatus !== undefined && device.pushStatus !== "OK") out.push("push");
  if (device.batteryLevel !== null && device.batteryLevel !== undefined && device.batteryLevel < 0.15) out.push("battery");
  if (device.clockOffsetMs !== null && device.clockOffsetMs !== undefined && Math.abs(device.clockOffsetMs) > CLOCK_WARN_MS) out.push("clock");
  if ((device.pendingMutations ?? 0) + (device.pendingUploads ?? 0) > 0 && device.oldestPendingAt !== null && device.oldestPendingAt !== undefined && Date.now() - Date.parse(device.oldestPendingAt) > 24 * 3600 * 1000) out.push("pending");
  return out;
}

const warnIcon = { push: BellOff, battery: BatteryLow, clock: Clock, pending: AlertTriangle } as const;

export function DeviceWarnings({ device }: { readonly device: TeamDevice }) {
  const t = useTranslations("team");
  const warnings = deviceWarnings(device);
  if (warnings.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {warnings.map((w) => {
        const Icon = warnIcon[w];
        return (
          <Badge icon={<Icon className="size-4" />} key={w} tone={w === "pending" ? "danger" : "warning"}>
            {t(`devices.warning.${w}`)}
          </Badge>
        );
      })}
    </span>
  );
}

export function DeviceSync({ device }: { readonly device: TeamDevice }) {
  return <SyncHealthBadge health={syncHealthOf(device.lastSyncAt ?? null, device.failedMutations ?? 0)} />;
}

export function DeviceCard({ device }: { readonly device: TeamDevice }) {
  const t = useTranslations("team");
  const locale = useLocale();
  return (
    <div className="flex flex-col gap-2 rounded-cards border border-[var(--ar-border)] bg-[var(--ar-surface)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold">{[device.model, t(`devices.platform.${device.platform}`)].filter(Boolean).join(" · ")}</span>
        <DeviceSync device={device} />
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
        <dt className="text-[var(--ar-text-muted)]">{t("devices.lastSync")}</dt>
        <dd>{formatDateTime(device.lastSyncAt, locale) || "—"}</dd>
        <dt className="text-[var(--ar-text-muted)]">{t("devices.pending")}</dt>
        <dd>{t("devices.pendingValue", { mutations: device.pendingMutations ?? 0, uploads: device.pendingUploads ?? 0 })}</dd>
        <dt className="text-[var(--ar-text-muted)]">{t("devices.appVersion")}</dt>
        <dd>{device.appVersion ?? "—"}</dd>
        <dt className="text-[var(--ar-text-muted)]">{t("devices.battery")}</dt>
        <dd>{device.batteryLevel === null || device.batteryLevel === undefined ? "—" : `${formatNumber(device.batteryLevel * 100, locale)}%`}</dd>
      </dl>
      <DeviceWarnings device={device} />
      <DiagnosticsList deviceId={device.id} />
    </div>
  );
}

/** EC-OPS-24: no uploaded diagnostics is an empty state with guidance, never an error page. */
export function DiagnosticsList({ deviceId }: { readonly deviceId: string }) {
  const t = useTranslations("team");
  const locale = useLocale();
  const query = useQuery({ queryKey: ["devices", deviceId, "diagnostics"], queryFn: () => api<{ items: DeviceDiagnostic[] }>(`/devices/${deviceId}/diagnostics`) });
  if (query.isLoading) return <LoadingState rows={1} />;
  if (query.error !== null) return <ErrorAlert compact error={query.error} onRetry={() => void query.refetch()} />;
  const items = query.data?.items ?? [];
  if (items.length === 0) return <EmptyState body={t("devices.diagnostics.emptyBody")} icon={<FileSearch className="size-6" />} title={t("devices.diagnostics.emptyTitle")} />;
  return (
    <details>
      <summary className="flex min-h-12 cursor-pointer items-center font-semibold">{t("devices.diagnostics.title", { count: items.length })}</summary>
      <ul className="flex flex-col gap-1 text-sm">
        {items.map((d) => (
          <li key={d.id}>
            {formatDateTime(d.createdAt, locale)} · {d.appVersion ?? "—"}
          </li>
        ))}
      </ul>
    </details>
  );
}
