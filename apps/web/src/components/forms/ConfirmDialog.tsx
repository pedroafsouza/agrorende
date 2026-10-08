"use client";

import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";

import { ErrorAlert } from "@/components/recovery/ErrorAlert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field, Textarea } from "@/components/ui/Field";

export interface ConfirmDialogProps {
  readonly open: boolean;
  readonly title: string;
  readonly body: string;
  readonly confirmLabel: string;
  readonly tone?: "danger" | "primary";
  /** When set, a reason is required and passed to `onConfirm` (audit trail for destructive actions). */
  readonly reasonLabel?: string;
  readonly onConfirm: (reason: string) => Promise<void>;
  readonly onClose: () => void;
  readonly errorAction?: (error: unknown) => ReactNode;
}

/** Explicit confirmation for destructive actions; the error stays in the dialog with a recovery action (REC-04). */
export function ConfirmDialog({ open, title, body, confirmLabel, tone = "danger", reasonLabel, onConfirm, onClose, errorAction }: ConfirmDialogProps) {
  const t = useTranslations("common");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const close = () => {
    setReason("");
    setError(null);
    onClose();
  };
  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm(reason.trim());
      close();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };
  const needsReason = reasonLabel !== undefined;
  return (
    <Dialog
      closeLabel={t("actions.close")}
      description={body}
      dismissible={!busy}
      footer={
        <>
          <Button disabled={busy} onClick={close}>
            {t("actions.cancel")}
          </Button>
          <Button busy={busy} disabled={needsReason && reason.trim().length === 0} onClick={() => void confirm()} variant={tone}>
            {confirmLabel}
          </Button>
        </>
      }
      onClose={close}
      open={open}
      title={title}
    >
      <div className="flex flex-col gap-4">
        {error === null ? null : <ErrorAlert action={errorAction?.(error)} error={error} />}
        {needsReason ? <Field label={reasonLabel} required>{(p) => <Textarea {...p} onChange={(e) => setReason(e.target.value)} value={reason} />}</Field> : null}
      </div>
    </Dialog>
  );
}
