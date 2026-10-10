"use client";

import { Save, UserX } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { EntityPicker } from "@/components/forms/EntityPicker";
import { ErrorAlert } from "@/components/recovery/ErrorAlert";
import { UnsavedChangesGuard } from "@/components/recovery/UnsavedChangesGuard";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { api, isApiError } from "@/lib/api";
import { useFieldErrors } from "@/lib/forms";
import { useSave } from "@/lib/useSave";

import { EMPTY_NEW_WORK_ORDER, PRIORITIES, WORK_ORDER_TYPES, newWorkOrderBody, type NewWorkOrderValues, type WorkOrderListItem } from "./types";

/** Manual work order (WO-20). EC-WO-19: an off-duty assignee needs an explicit confirmation. */
export function NewWorkOrderPage() {
  const t = useTranslations("jobs");
  const common = useTranslations("common");
  const router = useRouter();
  const fieldErrorsOf = useFieldErrors();
  const [values, setValues] = useState<NewWorkOrderValues>(EMPTY_NEW_WORK_ORDER);
  const [save, state] = useSave("work-orders", (body: Record<string, unknown>) => api<WorkOrderListItem>("/work-orders", { method: "POST", body }), (wo) => router.push(`/work-orders/${wo.id}`));
  const dirty = JSON.stringify(values) !== JSON.stringify(EMPTY_NEW_WORK_ORDER);
  const errors = fieldErrorsOf(state.error);
  const offDuty = isApiError(state.error, "WO_ASSIGNEE_OFF_DUTY");
  const set = (patch: Partial<NewWorkOrderValues>) => setValues({ ...values, ...patch });
  return (
    <div className="flex flex-col gap-4">
      <PageHeader back={{ href: "/work-orders", label: t("list.title") }} title={t("new.title")} />
      <UnsavedChangesGuard when={dirty && !state.busy} />
      <form
        className="flex flex-col gap-4 rounded-cards border border-[var(--ar-border)] bg-[var(--ar-surface)] p-4"
        id="work-order-new"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void save(newWorkOrderBody(values));
        }}
      >
        {state.error === null || offDuty ? null : <ErrorAlert error={state.error} />}
        {offDuty ? (
          <div className="flex flex-col gap-3 rounded-cards border-2 border-[var(--ar-warning)] p-4" role="alert">
            <p className="flex items-center gap-2 font-semibold">
              <UserX aria-hidden="true" className="size-5" />
              {t("offDuty.title")}
            </p>
            <p>{t("offDuty.body")}</p>
            <div className="flex flex-wrap gap-2">
              <Button pending={state.busy} onClick={() => void save(newWorkOrderBody(values, true))} variant="primary">
                {t("offDuty.confirm")}
              </Button>
              <Button onClick={() => { set({ assigneeId: null }); state.reset(); }}>{t("offDuty.leaveUnassigned")}</Button>
            </div>
          </div>
        ) : null}
        <Field error={errors.title} label={t("fields.title")} required>
          {(p) => <Input {...p} maxLength={200} onChange={(e) => set({ title: e.target.value })} value={values.title} />}
        </Field>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={t("fields.type")}>
            {(p) => (
              <Select {...p} onChange={(e) => set({ type: e.target.value as NewWorkOrderValues["type"] })} value={values.type}>
                {WORK_ORDER_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {t(`enums.workOrderType.${type}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t("fields.priority")}>
            {(p) => (
              <Select {...p} onChange={(e) => set({ priority: e.target.value as NewWorkOrderValues["priority"] })} value={values.priority}>
                {PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>
                    {common(`priority.${priority}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field error={errors.assetId} label={t("fields.asset")}>
            {(p) => <EntityPicker {...p} entity="assets" onChange={(assetId) => set({ assetId })} value={values.assetId} />}
          </Field>
          <Field error={errors.siteId} label={t("fields.site")}>
            {(p) => <EntityPicker {...p} entity="sites" onChange={(siteId) => set({ siteId })} value={values.siteId} />}
          </Field>
          <Field error={errors.customerId} label={t("fields.customer")}>
            {(p) => <EntityPicker {...p} entity="customers" onChange={(customerId) => set({ customerId })} value={values.customerId} />}
          </Field>
          <Field error={errors.assigneeId} hint={t("new.assigneeHint")} label={t("fields.assignee")}>
            {(p) => <EntityPicker {...p} entity="users" filters={{ role: "FIELD" }} onChange={(assigneeId) => set({ assigneeId })} value={values.assigneeId} />}
          </Field>
          <Field error={errors.dueAt} hint={t("new.dueHint")} label={t("fields.dueAt")}>
            {(p) => <Input {...p} onChange={(e) => set({ dueAt: e.target.value })} type="datetime-local" value={values.dueAt} />}
          </Field>
          <Field error={errors.scheduledFor} label={t("fields.scheduledFor")}>
            {(p) => <Input {...p} onChange={(e) => set({ scheduledFor: e.target.value })} type="date" value={values.scheduledFor} />}
          </Field>
        </div>
        <Field error={errors.description} label={t("fields.description")}>
          {(p) => <Textarea {...p} onChange={(e) => set({ description: e.target.value })} rows={5} value={values.description} />}
        </Field>
        <div className="flex justify-end gap-2">
          <Button onClick={() => router.push("/work-orders")}>{common("actions.cancel")}</Button>
          <Button pending={state.busy} disabled={values.title.trim().length === 0} icon={<Save aria-hidden="true" className="size-4" />} size="primary" type="submit" variant="primary">
            {t("actions.create")}
          </Button>
        </div>
      </form>
    </div>
  );
}
