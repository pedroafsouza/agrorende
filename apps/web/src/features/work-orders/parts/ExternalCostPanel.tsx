"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Lock, Pencil, Plus, Receipt } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { FormDialog } from "@/components/forms/FormDialog";
import { MoneyInput } from "@/components/forms/MoneyInput";
import { Button } from "@/components/ui/Button";
import { Field, Textarea } from "@/components/ui/Field";
import { api } from "@/lib/api";
import { formatMoney } from "@/lib/format";

import type { WorkOrderListItem } from "../types";

export interface ExternalCostPanelProps {
  readonly workOrder: Pick<WorkOrderListItem, "id" | "status" | "syncVersion" | "externalCostCents" | "externalCostNote">;
}

/** Same rule as `canEditExternalCost` in `workOrders/external.ts`: the external cost is recorded from COMPLETED on. */
export const EXTERNAL_COST_STATUSES: readonly string[] = ["COMPLETED", "VERIFIED"];

export function canEditExternalCost(status: string): boolean {
  return EXTERNAL_COST_STATUSES.includes(status);
}

/** External cost (ERP-03 P1): the value, its note and an edit action once the job is completed. */
export function ExternalCostPanel({ workOrder }: ExternalCostPanelProps) {
  const t = useTranslations("parts");
  const locale = useLocale();
  const [editing, setEditing] = useState(false);
  const cents = workOrder.externalCostCents ?? null;
  const editable = canEditExternalCost(workOrder.status);
  return (
    <section aria-labelledby="external-cost-title" className="rounded-cards border border-[var(--ar-border)] bg-[var(--ar-surface)] p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-semibold" id="external-cost-title">
          <Receipt aria-hidden="true" className="size-5" />
          {t("externalCost.title")}
        </h2>
        {editable ? (
          <Button icon={cents === null ? <Plus aria-hidden="true" className="size-4" /> : <Pencil aria-hidden="true" className="size-4" />} onClick={() => setEditing(true)}>
            {cents === null ? t("externalCost.add") : t("externalCost.edit")}
          </Button>
        ) : null}
      </div>
      {cents === null ? (
        <p className="text-[var(--ar-text-muted)]">{t("externalCost.none")}</p>
      ) : (
        <>
          <p className="text-2xl font-bold">{formatMoney(cents, locale)}</p>
          {workOrder.externalCostNote ? <p className="mt-1">{workOrder.externalCostNote}</p> : null}
          <p className="mt-1 text-sm text-[var(--ar-text-muted)]">{t("externalCost.rollUp")}</p>
        </>
      )}
      {editable ? null : (
        <p className="mt-2 flex items-center gap-2 text-sm text-[var(--ar-text-muted)]">
          <Lock aria-hidden="true" className="size-4" />
          {workOrder.status === "CANCELLED" ? t("externalCost.cancelledHint") : t("externalCost.lockedHint")}
        </p>
      )}
      {editing ? <ExternalCostForm onClose={() => setEditing(false)} workOrder={workOrder} /> : null}
    </section>
  );
}

function ExternalCostForm({ workOrder, onClose }: ExternalCostPanelProps & { readonly onClose: () => void }) {
  const t = useTranslations("parts");
  const client = useQueryClient();
  const [cents, setCents] = useState<number | null>(workOrder.externalCostCents ?? null);
  const [note, setNote] = useState(workOrder.externalCostNote ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  return (
    <FormDialog
      busy={busy}
      dirty={cents !== (workOrder.externalCostCents ?? null) || note !== (workOrder.externalCostNote ?? "")}
      error={error}
      formId="wo-external-cost-panel"
      onClose={onClose}
      onSubmit={() => {
        setBusy(true);
        setError(null);
        api(`/work-orders/${workOrder.id}/external-cost`, { method: "PATCH", body: { externalCostCents: cents ?? 0, ...(note.trim().length > 0 ? { externalCostNote: note.trim() } : {}) }, version: workOrder.syncVersion })
          .then(async () => {
            await client.invalidateQueries({ queryKey: ["work-orders"] });
            toast.success(t("externalCost.saved"));
            onClose();
          }, setError)
          .finally(() => setBusy(false));
      }}
      open
      title={workOrder.externalCostCents === null || workOrder.externalCostCents === undefined ? t("externalCost.add") : t("externalCost.edit")}
    >
      <Field label={t("externalCost.title")} required>
        {(p) => <MoneyInput {...p} cents={cents} onChange={setCents} />}
      </Field>
      <Field label={t("externalCost.note")}>{(p) => <Textarea {...p} onChange={(e) => setNote(e.target.value)} value={note} />}</Field>
    </FormDialog>
  );
}
