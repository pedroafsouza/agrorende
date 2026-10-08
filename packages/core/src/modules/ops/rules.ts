import type { Priority, WorkOrderStatus } from "@agrorende/contracts/enums";

import type { SlaState } from "./dto.js";

/** Settings the ops and costs read models need, with the `OrgSettingsSchema` defaults. */
export interface OpsSettings {
  readonly timezone: string;
  readonly slaHours: Readonly<Record<Priority, number>>;
  readonly slaAtRiskRatio: number;
  readonly staleSyncAlertHours: number;
  readonly rentalGraceHours: number;
  readonly showLaborCostToManager: boolean;
}

export const DEFAULT_OPS_SETTINGS: OpsSettings = {
  timezone: "America/Sao_Paulo",
  slaHours: { CRITICAL: 4, HIGH: 24, MEDIUM: 72, LOW: 168 },
  slaAtRiskRatio: 0.25,
  staleSyncAlertHours: 24,
  rentalGraceHours: 2,
  showLaborCostToManager: true,
};

function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** Reads a stored organization document leniently: missing keys fall back to the schema defaults. */
export function opsSettingsOf(org: { readonly timezone?: unknown; readonly settings?: unknown } | null | undefined): OpsSettings {
  const settings = (typeof org?.settings === "object" && org.settings !== null ? org.settings : {}) as Record<string, unknown>;
  const sla = (typeof settings.slaHours === "object" && settings.slaHours !== null ? settings.slaHours : {}) as Record<string, unknown>;
  const d = DEFAULT_OPS_SETTINGS;
  return {
    timezone: typeof org?.timezone === "string" && org.timezone.length > 0 ? org.timezone : d.timezone,
    slaHours: {
      CRITICAL: num(sla.CRITICAL, d.slaHours.CRITICAL),
      HIGH: num(sla.HIGH, d.slaHours.HIGH),
      MEDIUM: num(sla.MEDIUM, d.slaHours.MEDIUM),
      LOW: num(sla.LOW, d.slaHours.LOW),
    },
    slaAtRiskRatio: num(settings.slaAtRiskRatio, d.slaAtRiskRatio),
    staleSyncAlertHours: num(settings.staleSyncAlertHours, d.staleSyncAlertHours),
    rentalGraceHours: num(settings.rentalGraceHours, d.rentalGraceHours),
    showLaborCostToManager: typeof settings.showLaborCostToManager === "boolean" ? settings.showLaborCostToManager : d.showLaborCostToManager,
  };
}

export const TERMINAL_WO_STATUSES: readonly WorkOrderStatus[] = ["COMPLETED", "VERIFIED", "CANCELLED"];
export const OPEN_WO_STATUSES: readonly WorkOrderStatus[] = ["OPEN", "ASSIGNED", "ACCEPTED", "EN_ROUTE", "ON_SITE", "IN_PROGRESS", "ON_HOLD"];
/** Statuses counted by the "In progress" KPI: someone is travelling, on site, working or holding. */
export const WORKING_WO_STATUSES: readonly WorkOrderStatus[] = ["EN_ROUTE", "ON_SITE", "IN_PROGRESS", "ON_HOLD"];

const HOUR_MS = 3_600_000;
export const OPERATOR_STALE_MS = 5 * 60_000;

/**
 * SLA state (ARCHITECTURE §6.4): breached when `now > dueAt`; at risk when
 * `now ≥ dueAt − slaAtRiskRatio × slaHours[priority]`. Terminal or undated WOs have no SLA state.
 */
export function slaStateOf(
  wo: { readonly status: WorkOrderStatus; readonly priority: Priority; readonly dueAt?: Date | null },
  settings: Pick<OpsSettings, "slaHours" | "slaAtRiskRatio">,
  now: Date,
): SlaState | null {
  if (wo.dueAt === null || wo.dueAt === undefined || TERMINAL_WO_STATUSES.includes(wo.status)) return null;
  const due = wo.dueAt.getTime();
  if (now.getTime() > due) return "BREACHED";
  const window = settings.slaAtRiskRatio * settings.slaHours[wo.priority] * HOUR_MS;
  return now.getTime() >= due - window ? "AT_RISK" : "OK";
}

/** Latest `dueAt` that is already at risk for a priority: used to push the filter into MongoDB. */
export function atRiskDueCutoff(priority: Priority, settings: Pick<OpsSettings, "slaHours" | "slaAtRiskRatio">, now: Date): Date {
  return new Date(now.getTime() + settings.slaAtRiskRatio * settings.slaHours[priority] * HOUR_MS);
}

export function isRentalOverdue(rental: { readonly status: string; readonly plannedEnd: Date }, graceHours: number, now: Date): boolean {
  return rental.status === "ACTIVE" && now.getTime() > rental.plannedEnd.getTime() + graceHours * HOUR_MS;
}

export function isOperatorStale(recordedAt: Date, lastSeenAt: Date | null, now: Date): boolean {
  const newest = Math.max(recordedAt.getTime(), lastSeenAt?.getTime() ?? 0);
  return now.getTime() - newest > OPERATOR_STALE_MS;
}

function zonedParts(at: Date, timeZone: string): { y: number; m: number; d: number; h: number; mi: number; s: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  return { y: get("year"), m: get("month"), d: get("day"), h: get("hour"), mi: get("minute"), s: get("second") };
}

/** Midnight of `at`'s calendar day in the organisation timezone, as a UTC instant. */
export function startOfZonedDay(at: Date, timeZone: string): Date {
  const p = zonedParts(at, timeZone);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s);
  const offsetMs = asUtc - Math.floor(at.getTime() / 1000) * 1000;
  return new Date(Date.UTC(p.y, p.m - 1, p.d) - offsetMs);
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const value = sorted.length % 2 === 0 ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2 : (sorted[mid] ?? 0);
  return Math.round(value * 10) / 10;
}
