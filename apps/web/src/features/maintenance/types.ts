import type { AssetCategory, MaintenanceTrigger } from "@agrorende/contracts/enums";

export type { MaintenanceDueRow, MaintenancePlanRow } from "@agrorende/core/modules/maintenance/dto";

export interface PlanFormValues {
  name: string;
  target: "asset" | "category";
  assetId: string | null;
  assetCategory: AssetCategory | "";
  trigger: MaintenanceTrigger;
  intervalHours: string;
  intervalDays: string;
  lastDoneHourMeter: string;
  lastDoneAt: string;
  leadHours: string;
  leadDays: string;
}

export const EMPTY_PLAN_FORM: PlanFormValues = {
  name: "",
  target: "asset",
  assetId: null,
  assetCategory: "",
  trigger: "HOURS",
  intervalHours: "",
  intervalDays: "",
  lastDoneHourMeter: "",
  lastDoneAt: "",
  leadHours: "25",
  leadDays: "7",
};

function num(text: string): number | null {
  const trimmed = text.trim().replace(",", ".");
  if (trimmed.length === 0) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : Number.NaN;
}

/** Midnight of a `YYYY-MM-DD` date in São Paulo, the default organisation timezone. */
function dayToIso(day: string): string | null {
  return day.length === 0 ? null : `${day}T00:00:00-03:00`;
}

/** Body for `POST /maintenance-plans` and `PATCH /maintenance-plans/:id`; interval fields the trigger does not use are cleared. */
export function planBody(values: PlanFormValues): Record<string, unknown> {
  const usesHours = values.trigger !== "CALENDAR";
  const usesDays = values.trigger !== "HOURS";
  return {
    name: values.name.trim(),
    assetId: values.target === "asset" ? values.assetId : null,
    assetCategory: values.target === "category" && values.assetCategory !== "" ? values.assetCategory : null,
    trigger: values.trigger,
    intervalHours: usesHours ? num(values.intervalHours) : null,
    intervalDays: usesDays ? num(values.intervalDays) : null,
    lastDoneHourMeter: values.target === "asset" ? num(values.lastDoneHourMeter) : null,
    lastDoneAt: values.target === "asset" ? dayToIso(values.lastDoneAt) : null,
    leadHours: num(values.leadHours) ?? 0,
    leadDays: num(values.leadDays) ?? 0,
  };
}

export type DueTone = "danger" | "warning" | "info" | "success";

export function dueTone(row: { isOverdue: boolean; isDue: boolean; hasOpen: boolean }): DueTone {
  if (row.hasOpen) return "info";
  if (row.isOverdue) return "danger";
  return row.isDue ? "warning" : "success";
}
