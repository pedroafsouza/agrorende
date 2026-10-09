"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { FormDialog } from "@/components/forms/FormDialog";
import { MoneyInput } from "@/components/forms/MoneyInput";
import { Field, Textarea } from "@/components/ui/Field";
import { api } from "@/lib/api";

import type { WorkOrderListItem } from "../types";

/** Office dialog behind the "external cost" action (`PATCH /work-orders/:id/external-cost`). */
export function ExternalCostDialog({ workOrder, onClose, onDone }: { readonly workOrder: WorkOrderListItem; readonly onClose: () => void; readonly onDone: () => void }) {
  const t = useTranslations("jobs");
  const [cents, setCents] = useState<number | null>(workOrder.externalCostCents ?? null);
  const [note, setNote] = useState(workOrder.externalCostNote ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  return (
    <FormDialog
      busy={busy}
      dirty={cents !== (workOrder.externalCostCents ?? null) || note !== (workOrder.externalCostNote ?? "")}
      error={error}
      formId="wo-external-cost"
      onClose={onClose}
      onSubmit={() => {
        setBusy(true);
        setError(null);
        api(`/work-orders/${workOrder.id}/external-cost`, { method: "PATCH", body: { externalCostCents: cents ?? 0, ...(note.trim().length > 0 ? { externalCostNote: note.trim() } : {}) }, version: workOrder.syncVersion })
          .then(onDone, setError)
          .finally(() => setBusy(false));
      }}
      open
      title={t("dialogs.externalCost.title")}
    >
      <Field label={t("fields.externalCost")} required>{(p) => <MoneyInput {...p} cents={cents} onChange={setCents} />}</Field>
      <Field label={t("dialogs.externalCost.note")}>{(p) => <Textarea {...p} onChange={(e) => setNote(e.target.value)} value={note} />}</Field>
    </FormDialog>
  );
}
