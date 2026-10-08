"use client";

import { AlertOctagon, AlertTriangle, Archive, ArrowDown, ArrowUp, CheckCircle2, Circle, CircleDot, Clock, Minus, PauseCircle, Wrench, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import type { AssetCondition, FieldReportStatus, Priority, RentalStatus, WorkOrderStatus } from "@agrorende/contracts/enums";

import { Badge, type Tone } from "@/components/ui/Badge";

const icon = (node: ReactNode) => node;
const s = "size-4";

const conditionTone: Record<AssetCondition, [Tone, ReactNode]> = {
  OPERATIONAL: ["success", icon(<CheckCircle2 className={s} />)],
  NEEDS_REPAIR: ["warning", icon(<AlertTriangle className={s} />)],
  IN_REPAIR: ["info", icon(<Wrench className={s} />)],
  OUT_OF_SERVICE: ["danger", icon(<XCircle className={s} />)],
  RETIRED: ["neutral", icon(<Archive className={s} />)],
};

export function ConditionBadge({ condition }: { readonly condition: AssetCondition }) {
  const t = useTranslations("common");
  const [tone, glyph] = conditionTone[condition];
  return (
    <Badge icon={glyph} tone={tone}>
      {t(`condition.${condition}`)}
    </Badge>
  );
}

const priorityTone: Record<Priority, [Tone, ReactNode]> = {
  LOW: ["neutral", icon(<ArrowDown className={s} />)],
  MEDIUM: ["info", icon(<Minus className={s} />)],
  HIGH: ["warning", icon(<ArrowUp className={s} />)],
  CRITICAL: ["danger", icon(<AlertOctagon className={s} />)],
};

export function PriorityBadge({ priority }: { readonly priority: Priority }) {
  const t = useTranslations("common");
  const [tone, glyph] = priorityTone[priority];
  return (
    <Badge icon={glyph} tone={tone}>
      {t(`priority.${priority}`)}
    </Badge>
  );
}

type StatusKind = "workOrder" | "rental" | "report";
type StatusOf<K extends StatusKind> = K extends "workOrder" ? WorkOrderStatus : K extends "rental" ? RentalStatus : FieldReportStatus;

const statusTone: Record<string, [Tone, ReactNode]> = {
  OPEN: ["info", icon(<CircleDot className={s} />)],
  ASSIGNED: ["info", icon(<CircleDot className={s} />)],
  ACCEPTED: ["info", icon(<CircleDot className={s} />)],
  EN_ROUTE: ["primary", icon(<Clock className={s} />)],
  ON_SITE: ["primary", icon(<Wrench className={s} />)],
  IN_PROGRESS: ["primary", icon(<Wrench className={s} />)],
  ON_HOLD: ["warning", icon(<PauseCircle className={s} />)],
  COMPLETED: ["success", icon(<CheckCircle2 className={s} />)],
  VERIFIED: ["success", icon(<CheckCircle2 className={s} />)],
  CANCELLED: ["neutral", icon(<XCircle className={s} />)],
  DRAFT: ["neutral", icon(<Circle className={s} />)],
  RESERVED: ["info", icon(<Clock className={s} />)],
  ACTIVE: ["primary", icon(<CircleDot className={s} />)],
  RETURNED: ["success", icon(<CheckCircle2 className={s} />)],
  CLOSED: ["neutral", icon(<Archive className={s} />)],
  SUBMITTED: ["info", icon(<CircleDot className={s} />)],
  IN_REVIEW: ["primary", icon(<Clock className={s} />)],
  MARKED_FOR_REPAIR: ["warning", icon(<Wrench className={s} />)],
  MONITORING: ["info", icon(<Clock className={s} />)],
  DISMISSED: ["neutral", icon(<XCircle className={s} />)],
};

export function StatusBadge<K extends StatusKind>({ kind, status }: { readonly kind: K; readonly status: StatusOf<K> }) {
  const t = useTranslations("common");
  const [tone, glyph] = statusTone[status] ?? ["neutral", <Circle className={s} key="c" />];
  return (
    <Badge icon={glyph} tone={tone}>
      {t(`status.${kind as string}.${status as string}`)}
    </Badge>
  );
}

export type SyncHealth = "OK" | "STALE" | "STUCK" | "NEVER";

const syncTone: Record<SyncHealth, [Tone, ReactNode]> = {
  OK: ["success", icon(<CheckCircle2 className={s} />)],
  STALE: ["warning", icon(<Clock className={s} />)],
  STUCK: ["danger", icon(<AlertTriangle className={s} />)],
  NEVER: ["neutral", icon(<Circle className={s} />)],
};

/** Device sync health for Team → Devices (OFF-11): last sync age plus failed mutations. */
export function SyncHealthBadge({ health }: { readonly health: SyncHealth }) {
  const t = useTranslations("common");
  const [tone, glyph] = syncTone[health];
  return (
    <Badge icon={glyph} tone={tone}>
      {t(`syncHealth.${health}`)}
    </Badge>
  );
}

export function syncHealthOf(lastSyncAt: string | null, failedCount: number, now = Date.now()): SyncHealth {
  if (lastSyncAt === null) return "NEVER";
  if (failedCount > 0) return "STUCK";
  return now - Date.parse(lastSyncAt) > 24 * 3600 * 1000 ? "STALE" : "OK";
}
