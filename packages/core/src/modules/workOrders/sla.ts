import type { AssetCategory, Priority, WorkOrderStatus } from "@agrorende/contracts/enums";
import type { CriticalWindow } from "@agrorende/contracts/checklist";

/** SLA rules of BR-F2-2 and ARCHITECTURE §10 (`workOrders.slaScan`). */

export const DEFAULT_SLA_HOURS: Readonly<Record<Priority, number>> = { CRITICAL: 4, HIGH: 24, MEDIUM: 72, LOW: 168 };
export const DEFAULT_SLA_AT_RISK_RATIO = 0.25;

const HOUR_MS = 3_600_000;

/** Statuses whose SLA is still running. */
export const SLA_OPEN_STATUSES: readonly WorkOrderStatus[] = ["OPEN", "ASSIGNED", "ACCEPTED", "EN_ROUTE", "ON_SITE", "IN_PROGRESS", "ON_HOLD"];

export interface SlaSettings {
  readonly slaHours: Readonly<Record<Priority, number>>;
  readonly slaAtRiskRatio: number;
}

export type SlaState = "NONE" | "OK" | "AT_RISK" | "BREACHED";

function positive(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

/** Reads the SLA settings of an organisation, falling back to the documented defaults. */
export function slaSettingsOf(settings: unknown): SlaSettings {
  const source = (typeof settings === "object" && settings !== null ? settings : {}) as { slaHours?: Partial<Record<Priority, unknown>>; slaAtRiskRatio?: unknown };
  const hours = source.slaHours ?? {};
  const ratio = source.slaAtRiskRatio;
  return {
    slaHours: {
      CRITICAL: positive(hours.CRITICAL, DEFAULT_SLA_HOURS.CRITICAL),
      HIGH: positive(hours.HIGH, DEFAULT_SLA_HOURS.HIGH),
      MEDIUM: positive(hours.MEDIUM, DEFAULT_SLA_HOURS.MEDIUM),
      LOW: positive(hours.LOW, DEFAULT_SLA_HOURS.LOW),
    },
    slaAtRiskRatio: typeof ratio === "number" && ratio > 0 && ratio < 1 ? ratio : DEFAULT_SLA_AT_RISK_RATIO,
  };
}

/**
 * Extension point for the P1 critical-window rule (BR-F2-2, owned by T14): when a season's
 * critical window lists the asset's category, the window is halved. P0 callers pass no window.
 */
export function slaWindowHours(settings: SlaSettings, priority: Priority, criticalWindow: CriticalWindow | null = null): number {
  const hours = settings.slaHours[priority];
  return criticalWindow === null ? hours : hours / 2;
}

export function computeDueAt(createdAt: Date, priority: Priority, settings: SlaSettings, criticalWindow: CriticalWindow | null = null): Date {
  return new Date(createdAt.getTime() + slaWindowHours(settings, priority, criticalWindow) * HOUR_MS);
}

export interface SlaSubject {
  readonly status: WorkOrderStatus;
  readonly priority: Priority;
  readonly dueAt?: Date | null;
  readonly createdAt: Date;
}

/** At risk when less than `slaAtRiskRatio` of the window remains; breached once `now` passes `dueAt`. */
export function slaState(wo: SlaSubject, now: Date, settings: SlaSettings): SlaState {
  if (wo.dueAt === null || wo.dueAt === undefined || !SLA_OPEN_STATUSES.includes(wo.status)) return "NONE";
  const due = wo.dueAt.getTime();
  if (now.getTime() > due) return "BREACHED";
  const windowMs = Math.max(due - wo.createdAt.getTime(), 0) || settings.slaHours[wo.priority] * HOUR_MS;
  if (due - now.getTime() <= settings.slaAtRiskRatio * windowMs) return "AT_RISK";
  return "OK";
}

export interface SlaScanSubject extends SlaSubject {
  readonly slaAtRiskNotifiedAt?: Date | null;
  readonly slaBreachedAt?: Date | null;
}

/** Which one-shot SLA notification is due now, if any. Each fires at most once per work order. */
export function slaNotificationDue(wo: SlaScanSubject, now: Date, settings: SlaSettings): "AT_RISK" | "BREACHED" | null {
  const state = slaState(wo, now, settings);
  if (state === "BREACHED" && (wo.slaBreachedAt ?? null) === null) return "BREACHED";
  if (state === "AT_RISK" && (wo.slaAtRiskNotifiedAt ?? null) === null) return "AT_RISK";
  return null;
}

/**
 * BR-F2-2 (P1): the due date of a work order created at `createdAt`. When the current season has a
 * critical window that covers `createdAt` (in the organisation's time zone) and lists the asset's
 * category, the priority window is halved. Jobs without an asset keep the default window.
 * The season seam is loaded lazily so that this module stays free of database imports.
 */
export async function dueAtFor(
  tx: unknown,
  orgId: string,
  assetCategory: AssetCategory | null,
  createdAt: Date,
  priority: Priority,
  settings: SlaSettings,
  timeZone?: string,
): Promise<Date> {
  if (assetCategory === null) return computeDueAt(createdAt, priority, settings);
  const { criticalWindowFor } = await import("../seasons/service");
  const window = await criticalWindowFor(tx, orgId, assetCategory, createdAt, timeZone);
  return computeDueAt(createdAt, priority, settings, window);
}
