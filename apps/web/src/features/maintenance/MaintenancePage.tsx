"use client";

import { AssetCategoryEnum, MaintenanceTriggerEnum, type AssetCategory, type MaintenanceTrigger } from "@agrorende/contracts/enums";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, CheckCircle2, ClipboardList, Gauge, Pencil, Plus, Power, Wrench } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { Card } from "@/components/data/Detail";
import { EmptyState, QueryState } from "@/components/data/States";
import { EntityPicker } from "@/components/forms/EntityPicker";
import { FormDialog } from "@/components/forms/FormDialog";
import { ErrorAlert } from "@/components/recovery/ErrorAlert";
import { PageHeader } from "@/components/shell/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Checkbox, Field, Input, Select } from "@/components/ui/Field";
import { api } from "@/lib/api";
import { formatDateTime, formatNumber } from "@/lib/format";
import { useFieldErrors, type ListPage } from "@/lib/forms";
import { useSave } from "@/lib/useSave";

import { dueTone, EMPTY_PLAN_FORM, planBody, type MaintenanceDueRow, type MaintenancePlanRow, type PlanFormValues } from "./types";

const text = (value: number | null | undefined) => (value === null || value === undefined ? "" : String(value));

const valuesOf = (plan: MaintenancePlanRow): PlanFormValues => ({
  name: plan.name,
  target: plan.assetId === null || plan.assetId === undefined ? "category" : "asset",
  assetId: plan.assetId ?? null,
  assetCategory: plan.assetCategory ?? "",
  trigger: plan.trigger,
  intervalHours: text(plan.intervalHours),
  intervalDays: text(plan.intervalDays),
  lastDoneHourMeter: text(plan.lastDoneHourMeter),
  lastDoneAt: plan.lastDoneAt === null || plan.lastDoneAt === undefined ? "" : plan.lastDoneAt.slice(0, 10),
  leadHours: String(plan.leadHours),
  leadDays: String(plan.leadDays),
});

/** Office preventive maintenance page (ERP-06): plans by hour meter or calendar and the machines they put due. */
export function MaintenancePage() {
  const t = useTranslations("maintenance");
  const common = useTranslations("common");
  const [showInactive, setShowInactive] = useState(false);
  const [target, setTarget] = useState<MaintenancePlanRow | "new" | null>(null);
  const [values, setValues] = useState<PlanFormValues>(EMPTY_PLAN_FORM);
  const [duePlan, setDuePlan] = useState<MaintenancePlanRow | null>(null);
  const list = useQuery({
    queryKey: ["maintenance-plans", { showInactive }],
    queryFn: () => api<ListPage<MaintenancePlanRow>>("/maintenance-plans", { query: { includeInactive: showInactive ? "true" : undefined } }),
  });
  const [save, state] = useSave(
    "maintenance-plans",
    (input: { target: MaintenancePlanRow | "new"; body: Record<string, unknown> }) =>
      input.target === "new"
        ? api<MaintenancePlanRow>("/maintenance-plans", { method: "POST", body: input.body })
        : api<MaintenancePlanRow>(`/maintenance-plans/${input.target.id}`, { method: "PATCH", body: input.body, version: input.target.syncVersion }),
    () => {
      setTarget(null);
      toast.success(t("toast.saved"));
    },
  );
  const [toggle, toggleState] = useSave(
    "maintenance-plans",
    (plan: MaintenancePlanRow) => api<MaintenancePlanRow>(`/maintenance-plans/${plan.id}`, { method: "PATCH", body: { isActive: !plan.isActive }, version: plan.syncVersion }),
    () => toast.success(t("toast.saved")),
  );
  const fe = useFieldErrors()(state.error);
  const set = <K extends keyof PlanFormValues>(key: K, value: PlanFormValues[K]) => setValues((current) => ({ ...current, [key]: value }));
  const open = (plan: MaintenancePlanRow | "new") => {
    setValues(plan === "new" ? EMPTY_PLAN_FORM : valuesOf(plan));
    state.reset();
    setTarget(plan);
  };
  const intervalText = (plan: MaintenancePlanRow) =>
    [plan.intervalHours === null || plan.intervalHours === undefined ? null : t("interval.hours", { hours: plan.intervalHours }), plan.intervalDays === null || plan.intervalDays === undefined ? null : t("interval.days", { days: plan.intervalDays })]
      .filter((x): x is string => x !== null)
      .join(" · ");

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        actions={
          <Button icon={<Plus aria-hidden="true" className="size-4" />} onClick={() => open("new")} variant="primary">
            {t("actions.new")}
          </Button>
        }
        subtitle={t("subtitle")}
        title={t("title")}
      />
      <Checkbox checked={showInactive} label={t("showInactive")} onChange={(e) => setShowInactive(e.target.checked)} />
      {toggleState.error === null ? null : <ErrorAlert error={toggleState.error} onRetry={() => void list.refetch()} />}
      <QueryState
        empty={<EmptyState action={<Button onClick={() => open("new")} variant="primary">{t("actions.new")}</Button>} body={t("emptyBody")} icon={<Wrench className="size-8" />} title={t("emptyTitle")} />}
        error={list.error}
        isEmpty={(list.data?.items.length ?? 0) === 0}
        isLoading={list.isLoading}
        onRetry={() => void list.refetch()}
      >
        <ul className="grid gap-4 md:grid-cols-2">
          {(list.data?.items ?? []).map((plan) => (
            <li key={plan.id}>
              <Card
                actions={
                  plan.isActive ? (
                    plan.dueCount > 0 ? (
                      <Badge icon={<CalendarClock aria-hidden="true" className="size-4" />} tone="warning">
                        {t("due.count", { count: plan.dueCount })}
                      </Badge>
                    ) : (
                      <Badge icon={<CheckCircle2 aria-hidden="true" className="size-4" />} tone="success">
                        {t("status.ok")}
                      </Badge>
                    )
                  ) : (
                    <Badge tone="neutral">{t("status.inactive")}</Badge>
                  )
                }
                title={plan.name}
              >
                <p className="text-[var(--ar-text-muted)]">
                  {plan.assetCode === null ? common(`category.${plan.assetCategory ?? "TRACTOR"}`) : `${plan.assetCode} · ${plan.assetName ?? ""}`}
                  {` · ${t("due.machines", { count: plan.assetCount })}`}
                </p>
                <p className="mt-1 inline-flex items-center gap-2">
                  <Gauge aria-hidden="true" className="size-4" />
                  {`${t(`trigger.${plan.trigger}`)} · ${intervalText(plan)}`}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button icon={<ClipboardList aria-hidden="true" className="size-4" />} onClick={() => setDuePlan(plan)}>
                    {t("actions.due")}
                  </Button>
                  <Button icon={<Pencil aria-hidden="true" className="size-4" />} onClick={() => open(plan)} variant="ghost">
                    {t("actions.edit")}
                  </Button>
                  <Button busy={toggleState.busy} icon={<Power aria-hidden="true" className="size-4" />} onClick={() => void toggle(plan)} variant="ghost">
                    {plan.isActive ? t("actions.deactivate") : t("actions.activate")}
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      </QueryState>
      <FormDialog
        busy={state.busy}
        dirty
        error={state.error}
        formId="maintenance-plan-form"
        onClose={() => setTarget(null)}
        onSubmit={() => (target === null ? undefined : void save({ target, body: planBody(values) }))}
        open={target !== null}
        size="lg"
        title={target === "new" ? t("dialog.newTitle") : t("dialog.editTitle")}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field className="sm:col-span-2" error={fe.name} label={t("fields.name")} required>
            {(p) => <Input {...p} onChange={(e) => set("name", e.target.value)} value={values.name} />}
          </Field>
          <fieldset className="sm:col-span-2">
            <legend className="mb-1 text-sm font-semibold">{t("fields.target")}</legend>
            <p className="mb-2 text-sm text-[var(--ar-text-muted)]">{t("dialog.targetHint")}</p>
            <div className="flex flex-wrap gap-x-6">
              {(["asset", "category"] as const).map((option) => (
                <label className="inline-flex min-h-12 items-center gap-2" key={option}>
                  <input checked={values.target === option} className="size-5" name="plan-target" onChange={() => set("target", option)} type="radio" />
                  {option === "asset" ? t("fields.targetAsset") : t("fields.targetCategory")}
                </label>
              ))}
            </div>
          </fieldset>
          {values.target === "asset" ? (
            <Field error={fe.assetId} label={t("fields.asset")} required>
              {(p) => <EntityPicker {...p} entity="assets" onChange={(id) => set("assetId", id)} value={values.assetId} />}
            </Field>
          ) : (
            <Field error={fe.assetCategory ?? fe.assetId} label={t("fields.category")} required>
              {(p) => (
                <Select {...p} onChange={(e) => set("assetCategory", e.target.value as AssetCategory | "")} value={values.assetCategory}>
                  <option value="">—</option>
                  {AssetCategoryEnum.options.map((c) => (
                    <option key={c} value={c}>
                      {common(`category.${c}`)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}
          <Field error={fe.trigger} label={t("fields.trigger")} required>
            {(p) => (
              <Select {...p} onChange={(e) => set("trigger", e.target.value as MaintenanceTrigger)} value={values.trigger}>
                {MaintenanceTriggerEnum.options.map((trigger) => (
                  <option key={trigger} value={trigger}>
                    {t(`trigger.${trigger}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {values.trigger === "CALENDAR" ? null : (
            <Field error={fe.intervalHours} label={t("fields.intervalHours")} required>
              {(p) => <Input {...p} inputMode="decimal" onChange={(e) => set("intervalHours", e.target.value)} value={values.intervalHours} />}
            </Field>
          )}
          {values.trigger === "HOURS" ? null : (
            <Field error={fe.intervalDays} label={t("fields.intervalDays")} required>
              {(p) => <Input {...p} inputMode="numeric" onChange={(e) => set("intervalDays", e.target.value)} value={values.intervalDays} />}
            </Field>
          )}
          {values.target === "asset" ? (
            <>
              <Field error={fe.lastDoneHourMeter} label={t("fields.lastDoneHourMeter")}>
                {(p) => <Input {...p} inputMode="decimal" onChange={(e) => set("lastDoneHourMeter", e.target.value)} value={values.lastDoneHourMeter} />}
              </Field>
              <Field error={fe.lastDoneAt} label={t("fields.lastDoneAt")}>
                {(p) => <Input {...p} onChange={(e) => set("lastDoneAt", e.target.value)} type="date" value={values.lastDoneAt} />}
              </Field>
            </>
          ) : null}
          {values.trigger === "CALENDAR" ? null : (
            <Field error={fe.leadHours} label={t("fields.leadHours")}>
              {(p) => <Input {...p} inputMode="decimal" onChange={(e) => set("leadHours", e.target.value)} value={values.leadHours} />}
            </Field>
          )}
          {values.trigger === "HOURS" ? null : (
            <Field error={fe.leadDays} label={t("fields.leadDays")}>
              {(p) => <Input {...p} inputMode="numeric" onChange={(e) => set("leadDays", e.target.value)} value={values.leadDays} />}
            </Field>
          )}
        </div>
      </FormDialog>
      {duePlan === null ? null : <DueDialog onClose={() => setDuePlan(null)} plan={duePlan} />}
    </div>
  );
}

function DueDialog({ plan, onClose }: { readonly plan: MaintenancePlanRow; readonly onClose: () => void }) {
  const t = useTranslations("maintenance");
  const common = useTranslations("common");
  const locale = useLocale();
  const query = useQuery({ queryKey: ["maintenance-plans", plan.id, "due"], queryFn: () => api<ListPage<MaintenanceDueRow>>(`/maintenance-plans/${plan.id}/due`) });
  const statusOf = (row: MaintenanceDueRow) => (row.hasOpen ? t("status.open") : row.isOverdue ? t("status.overdue") : row.isDue ? t("status.due") : t("status.ok"));
  const remaining = (row: MaintenanceDueRow) =>
    [
      row.hoursRemaining === null ? null : row.hoursRemaining < 0 ? t("due.hoursOver", { hours: formatNumber(-row.hoursRemaining, locale, 1) }) : t("due.hoursLeft", { hours: formatNumber(row.hoursRemaining, locale, 1) }),
      row.daysRemaining === null ? null : row.daysRemaining < 0 ? t("due.daysOver", { days: -row.daysRemaining }) : t("due.daysLeft", { days: row.daysRemaining }),
    ]
      .filter((x): x is string => x !== null)
      .join(" · ");
  return (
    <Dialog closeLabel={common("actions.close")} onClose={onClose} open size="lg" title={t("dialog.dueTitle", { name: plan.name })}>
      <QueryState
        empty={<EmptyState body={t("due.emptyBody")} icon={<Wrench className="size-8" />} title={t("due.emptyTitle")} />}
        error={query.error}
        isEmpty={(query.data?.items.length ?? 0) === 0}
        isLoading={query.isLoading}
        onRetry={() => void query.refetch()}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <caption className="sr-only">{t("dialog.dueTitle", { name: plan.name })}</caption>
            <thead>
              <tr className="border-b border-[var(--ar-border)]">
                <th className="py-2">{t("fields.asset")}</th>
                <th className="py-2">{t("fields.hourMeter")}</th>
                <th className="py-2">{t("fields.nextDue")}</th>
                <th className="py-2">{t("fields.remaining")}</th>
                <th className="py-2">{t("fields.status")}</th>
              </tr>
            </thead>
            <tbody>
              {(query.data?.items ?? []).map((row) => (
                <tr className="border-b border-[var(--ar-border)]" key={row.assetId}>
                  <td className="py-2 font-semibold">{`${row.assetCode} · ${row.assetName}`}</td>
                  <td className="py-2">{row.hourMeter === null ? "—" : `${formatNumber(row.hourMeter, locale, 1)} h`}</td>
                  <td className="py-2">
                    {[row.nextDueHourMeter === null ? null : t("due.atHours", { hours: formatNumber(row.nextDueHourMeter, locale, 0) }), row.nextDueAt === null ? null : formatDateTime(row.nextDueAt, locale)].filter((x): x is string => x !== null).join(" · ") || "—"}
                  </td>
                  <td className="py-2">{remaining(row) || "—"}</td>
                  <td className="py-2">
                    <Badge tone={dueTone(row)}>{statusOf(row)}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </QueryState>
    </Dialog>
  );
}
