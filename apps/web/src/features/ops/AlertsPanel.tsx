"use client";

import { AlertOctagon, AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { formatDateTime } from "@/lib/format";

import { groupAlerts, type AlertGroup } from "./filters";
import type { OpsAlertDTO } from "./types";

export function alertHref(alert: OpsAlertDTO): string {
  switch (alert.entityType) {
    case "WORK_ORDER":
      return `/work-orders/${alert.entityId}`;
    case "RENTAL":
      return `/rentals/${alert.entityId}`;
    case "FIELD_REPORT":
      return `/reports/${alert.entityId}`;
    case "DEVICE":
      return `/team/devices?device=${encodeURIComponent(alert.entityId)}`;
    default:
      return "/ops";
  }
}

function AlertRow({ alert }: { readonly alert: OpsAlertDTO }) {
  const t = useTranslations("ops.alerts");
  const locale = useLocale();
  return (
    <li>
      <Link
        className="flex min-h-12 items-center gap-3 rounded-controls px-3 py-2 hover:bg-[var(--ar-surface-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ar-focus)]"
        href={alertHref(alert)}
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{alert.label}</span>
          <span className="block text-xs text-[var(--ar-text-muted)]">{t(`since.${alert.type}`, { at: formatDateTime(alert.at, locale) })}</span>
        </span>
        <ChevronRight aria-hidden="true" className="size-4 shrink-0" />
      </Link>
    </li>
  );
}

function Group({ group }: { readonly group: AlertGroup }) {
  const t = useTranslations("ops.alerts");
  const locale = useLocale();
  const times = group.items.map((i) => Date.parse(i.at)).filter((n) => Number.isFinite(n));
  const [open, setOpen] = useState(!group.collapsible);
  const Icon = group.severity === "critical" ? AlertOctagon : AlertTriangle;
  const listId = `ops-alerts-${group.type}`;
  const heading = (
    <span className="flex items-center gap-2">
      <Icon aria-hidden="true" className={`size-5 shrink-0 ${group.severity === "critical" ? "text-[var(--ar-danger)]" : "text-[var(--ar-warning-text)]"}`} />
      <span className="font-semibold">{t(`types.${group.type}`)}</span>
      <span className="rounded-full bg-[var(--ar-surface-muted)] px-2 text-xs font-bold tabular-nums">{group.items.length}</span>
    </span>
  );
  return (
    <li className={`rounded-cards border-l-4 bg-[var(--ar-surface)] ${group.severity === "critical" ? "border-[var(--ar-danger)]" : "border-[var(--ar-warning)]"}`}>
      {group.collapsible ? (
        <button
          aria-controls={listId}
          aria-expanded={open}
          className="flex min-h-12 w-full items-center justify-between gap-2 px-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ar-focus)]"
          onClick={() => setOpen((v) => !v)}
          type="button"
        >
          <span className="flex flex-col">
            {heading}
            {times.length === 0 ? null : (
              <span className="text-xs text-[var(--ar-text-muted)]">
                {t("range", { oldest: formatDateTime(new Date(Math.min(...times)).toISOString(), locale), newest: formatDateTime(new Date(Math.max(...times)).toISOString(), locale) })}
              </span>
            )}
          </span>
          <span className="flex items-center gap-1 text-sm text-[var(--ar-link)]">
            {open ? t("collapse") : t("expand", { count: group.items.length })}
            <ChevronDown aria-hidden="true" className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} />
          </span>
        </button>
      ) : (
        <div className="flex min-h-12 items-center px-3">{heading}</div>
      )}
      {open ? (
        <ul className="pb-2" id={listId}>
          {group.items.map((a) => (
            <AlertRow alert={a} key={a.id} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/** Alert list grouped by type; large groups collapse behind one header so nothing is hidden (EC-OPS-21). */
export function AlertsPanel({ alerts }: { readonly alerts: readonly OpsAlertDTO[] }) {
  const t = useTranslations("ops");
  const groups = groupAlerts(alerts);
  const many = groups.some((g) => g.collapsible);
  return (
    <section aria-labelledby="ops-alerts-title" className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold" id="ops-alerts-title">
        {t("alerts.title")}
      </h2>
      {many ? (
        <p className="rounded-controls bg-[var(--ar-info-bg)] p-3 text-sm text-[var(--ar-info-text)]" role="note">
          <span className="block font-semibold">{t("errors.ALERTS_COLLAPSED.title")}</span>
          {t("errors.ALERTS_COLLAPSED.body")}
        </p>
      ) : null}
      {groups.length === 0 ? (
        <p className="text-sm text-[var(--ar-text-muted)]">{t("alerts.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {groups.map((g) => (
            <Group group={g} key={g.type} />
          ))}
        </ul>
      )}
    </section>
  );
}
