"use client";

import type { SuggestionsQuery, SuggestionsResponse } from "@agrorende/api-client";
import { useQuery } from "@tanstack/react-query";
import { Link2, Wrench } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { EntityPicker } from "@/components/forms/EntityPicker";
import { FormDialog } from "@/components/forms/FormDialog";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { api, isApiError } from "@/lib/api";

import { PRIORITIES, type FieldReportDetail, type MarkForRepairResult, type OpenWorkOrderSummary } from "./types";

export interface MarkForRepairValues {
  readonly title: string;
  readonly priority: FieldReportDetail["priority"];
  readonly assigneeId: string | null;
  readonly scheduledFor: string;
}

/** Request body for `POST /field-reports/:id/mark-for-repair`; empty optional fields are left out. */
export function markForRepairBody(values: MarkForRepairValues, existing?: { readonly mode: "attach" | "createAnyway"; readonly reason?: string }): Record<string, unknown> {
  return {
    title: values.title.trim().length > 0 ? values.title.trim() : undefined,
    priority: values.priority,
    assigneeId: values.assigneeId ?? undefined,
    scheduledFor: values.scheduledFor.length > 0 ? values.scheduledFor : undefined,
    existing: existing?.mode,
    reason: existing?.reason,
  };
}

/** The open job carried by an `ASSET_REPAIR_ALREADY_OPEN` error (EC-FR-15), if any. */
export function existingWorkOrderOf(error: unknown): OpenWorkOrderSummary | null {
  if (!isApiError(error, "ASSET_REPAIR_ALREADY_OPEN")) return null;
  const workOrder = error.details.workOrder;
  return typeof workOrder === "object" && workOrder !== null ? (workOrder as OpenWorkOrderSummary) : null;
}

/** Mark for repair (F1 → F2): suggested assignee from T07, and EC-FR-15 attach / create-anyway recovery. */
export function MarkForRepairDialog({ report, open, onClose, onDone }: { readonly report: FieldReportDetail; readonly open: boolean; readonly onClose: () => void; readonly onDone: (result: MarkForRepairResult) => void }) {
  const t = useTranslations("reports");
  const common = useTranslations("common");
  const [values, setValues] = useState<MarkForRepairValues>({ title: report.title, priority: report.priority, assigneeId: null, scheduledFor: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [reason, setReason] = useState("");
  const suggestions = useQuery({
    enabled: open,
    queryKey: ["work-orders", "suggestions", report.id],
    queryFn: () => api<SuggestionsResponse>("/work-orders/suggestions", { query: { fieldReportId: report.id } satisfies SuggestionsQuery }),
    retry: false,
  });
  const existing = existingWorkOrderOf(error);

  const submit = async (mode?: { readonly mode: "attach" | "createAnyway"; readonly reason?: string }) => {
    setBusy(true);
    setError(null);
    try {
      const result = await api<MarkForRepairResult>(`/field-reports/${report.id}/mark-for-repair`, { method: "POST", body: markForRepairBody(values, mode) });
      onDone(result);
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormDialog
      busy={busy}
      dirty={false}
      error={existing === null ? error : null}
      formId="mark-for-repair"
      onClose={onClose}
      onSubmit={() => void submit()}
      open={open}
      size="lg"
      submitLabel={t("dialogs.markForRepair.submit")}
      title={t("dialogs.markForRepair.title")}
    >
      {existing === null ? null : (
        <section aria-live="polite" className="flex flex-col gap-3 rounded-cards border-2 border-[var(--ar-warning)] bg-[var(--ar-surface)] p-4" role="alert">
          <h3 className="flex items-center gap-2 text-lg font-semibold">
            <Wrench aria-hidden="true" className="size-5" />
            {t("dialogs.existing.title")}
          </h3>
          <p>{t("dialogs.existing.body")}</p>
          <p className="font-semibold">
            <span className="font-mono">{existing.number}</span> · {existing.title}
          </p>
          <p className="text-sm text-[var(--ar-text-muted)]">{existing.assigneeName === null ? t("dialogs.existing.unassigned") : t("dialogs.existing.assignee", { name: existing.assigneeName })}</p>
          <Button busy={busy} icon={<Link2 aria-hidden="true" className="size-4" />} onClick={() => void submit({ mode: "attach" })} variant="primary">
            {t("actions.attachExisting", { number: existing.number })}
          </Button>
          <Field label={t("dialogs.existing.reason")} required>
            {(p) => <Textarea {...p} onChange={(e) => setReason(e.target.value)} value={reason} />}
          </Field>
          <Button busy={busy} disabled={reason.trim().length === 0} onClick={() => void submit({ mode: "createAnyway", reason: reason.trim() })}>
            {t("actions.createAnyway")}
          </Button>
        </section>
      )}
      <Field label={t("dialogs.markForRepair.woTitle")}>{(p) => <Input {...p} maxLength={200} onChange={(e) => setValues({ ...values, title: e.target.value })} value={values.title} />}</Field>
      <Field label={t("fields.priority")}>
        {(p) => (
          <Select {...p} onChange={(e) => setValues({ ...values, priority: e.target.value as MarkForRepairValues["priority"] })} value={values.priority}>
            {PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {common(`priority.${priority}`)}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold">{t("dialogs.markForRepair.suggested")}</legend>
        {suggestions.data === undefined || suggestions.data.items.length === 0 ? (
          <p className="text-sm text-[var(--ar-text-muted)]">{t("dialogs.markForRepair.noSuggestions")}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {suggestions.data.items.slice(0, 3).map((s) => (
              <Button aria-pressed={values.assigneeId === s.userId} key={s.userId} onClick={() => setValues({ ...values, assigneeId: s.userId })} variant={values.assigneeId === s.userId ? "primary" : "secondary"}>
                {s.name} · {t("dialogs.markForRepair.suggestionMeta", { open: s.openWorkOrders })}
              </Button>
            ))}
          </div>
        )}
      </fieldset>
      <Field label={t("dialogs.markForRepair.assignee")}>
        {(p) => <EntityPicker {...p} entity="users" filters={{ role: "FIELD" }} onChange={(assigneeId) => setValues({ ...values, assigneeId })} value={values.assigneeId} />}
      </Field>
      <Field label={t("dialogs.markForRepair.scheduledFor")}>{(p) => <Input {...p} onChange={(e) => setValues({ ...values, scheduledFor: e.target.value })} type="date" value={values.scheduledFor} />}</Field>
    </FormDialog>
  );
}
