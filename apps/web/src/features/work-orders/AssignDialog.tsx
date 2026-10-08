"use client";

import { useQuery } from "@tanstack/react-query";
import { MapPin, Radio, UserX, Wrench } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { EntityPicker } from "@/components/forms/EntityPicker";
import { FormDialog } from "@/components/forms/FormDialog";
import { Button } from "@/components/ui/Button";
import { Field, Textarea } from "@/components/ui/Field";
import { api, isApiError } from "@/lib/api";

import type { Suggestion, WorkOrderListItem } from "./types";

/** Assign or reassign (WO-03/04): ranked suggestions, any field user, and the EC-WO-19 off-duty confirmation. */
export function AssignDialog({ workOrder, mode, open, onClose, onDone }: { readonly workOrder: WorkOrderListItem; readonly mode: "assign" | "reassign"; readonly open: boolean; readonly onClose: () => void; readonly onDone: () => void }) {
  const t = useTranslations("jobs");
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [missing, setMissing] = useState(false);
  const suggestions = useQuery({ enabled: open, queryKey: ["work-orders", workOrder.id, "suggestions"], queryFn: () => api<{ items: Suggestion[] }>(`/work-orders/${workOrder.id}/suggestions`), retry: false });
  const offDuty = isApiError(error, "WO_ASSIGNEE_OFF_DUTY");
  const needsReason = mode === "reassign";
  const submit = async (confirmOffDuty = false) => {
    if (assigneeId === null || (needsReason && reason.trim().length === 0)) {
      setMissing(true);
      return;
    }
    setMissing(false);
    setBusy(true);
    setError(null);
    try {
      await api(`/work-orders/${workOrder.id}/${mode}`, { method: "POST", body: { assigneeId, ...(needsReason ? { reason: reason.trim() } : {}), ...(confirmOffDuty ? { confirmOffDuty: true } : {}) } });
      onDone();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };
  return (
    <FormDialog
      busy={busy}
      dirty={assigneeId !== null || reason.length > 0}
      error={offDuty ? null : error}
      formId={`wo-${mode}`}
      onClose={onClose}
      onSubmit={() => void submit()}
      open={open}
      size="lg"
      submitLabel={t(`actions.${mode}`)}
      title={t(`dialogs.${mode}.title`, { number: workOrder.number })}
    >
      {offDuty ? (
        <div className="flex flex-col gap-3 rounded-cards border-2 border-[var(--ar-warning)] p-4" role="alert">
          <p className="flex items-center gap-2 font-semibold">
            <UserX aria-hidden="true" className="size-5" />
            {t("offDuty.title")}
          </p>
          <p>{t("offDuty.body")}</p>
          <Button busy={busy} onClick={() => void submit(true)} variant="primary">
            {t("offDuty.confirm")}
          </Button>
        </div>
      ) : null}
      {missing ? (
        <p className="font-semibold text-[var(--ar-danger-text)]" role="alert">
          {t("dialogs.missingAssignee")}
        </p>
      ) : null}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold">{t("dialogs.suggested")}</legend>
        {suggestions.isLoading ? (
          <p className="text-sm">{t("dialogs.loadingSuggestions")}</p>
        ) : suggestions.data === undefined || suggestions.data.items.length === 0 ? (
          <p className="text-sm text-[var(--ar-text-muted)]">{t("dialogs.noSuggestions")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {suggestions.data.items.map((s) => {
              const selected = assigneeId === s.userId;
              return (
                <li key={s.userId}>
                  <button
                    aria-pressed={selected}
                    className={`flex min-h-12 w-full flex-col gap-1 rounded-controls border p-3 text-left ${selected ? "border-2 border-[var(--ar-primary)] bg-[var(--ar-surface-muted)]" : "border-[var(--ar-border-strong)]"}`}
                    onClick={() => setAssigneeId(s.userId)}
                    type="button"
                  >
                    <span className="flex items-center justify-between gap-2 font-semibold">
                      {s.name}
                      <span className="inline-flex items-center gap-1 text-sm font-normal">
                        <Radio aria-hidden="true" className="size-4" />
                        {s.online ? t("suggestion.online") : t("suggestion.offline")}
                      </span>
                    </span>
                    <span className="flex flex-wrap gap-3 text-sm text-[var(--ar-text-muted)]">
                      <span className="inline-flex items-center gap-1">
                        <Wrench aria-hidden="true" className="size-4" />
                        {t("suggestion.open", { count: s.openWorkOrders })}
                      </span>
                      {s.distanceKm === null || s.distanceKm === undefined ? null : (
                        <span className="inline-flex items-center gap-1">
                          <MapPin aria-hidden="true" className="size-4" />
                          {t("suggestion.distance", { km: Math.round(s.distanceKm) })}
                        </span>
                      )}
                      {s.reasons.map((reason) => (
                        <span key={reason}>{t.has(`suggestion.reason.${reason}`) ? t(`suggestion.reason.${reason}`) : reason}</span>
                      ))}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </fieldset>
      <Field label={t("dialogs.anyone")}>{(p) => <EntityPicker {...p} entity="users" filters={{ role: "FIELD" }} onChange={setAssigneeId} value={assigneeId} />}</Field>
      {needsReason ? <Field label={t("dialogs.reassign.reason")} required>{(p) => <Textarea {...p} onChange={(e) => setReason(e.target.value)} value={reason} />}</Field> : null}
    </FormDialog>
  );
}
