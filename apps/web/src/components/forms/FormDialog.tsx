"use client";

import { Save } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { ErrorAlert } from "@/components/recovery/ErrorAlert";
import { UnsavedChangesGuard } from "@/components/recovery/UnsavedChangesGuard";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";

export interface FormDialogProps {
  readonly open: boolean;
  readonly title: string;
  readonly formId: string;
  readonly busy: boolean;
  readonly dirty: boolean;
  readonly error: unknown;
  readonly submitLabel?: string;
  readonly onClose: () => void;
  readonly onSubmit: () => void;
  readonly children: ReactNode;
  readonly size?: "md" | "lg";
  readonly errorAction?: ReactNode;
}

/** Create/edit form in a dialog: server errors keep the typed values and the dialog open (REC-02). */
export function FormDialog({ open, title, formId, busy, dirty, error, submitLabel, onClose, onSubmit, children, size = "md", errorAction }: FormDialogProps) {
  const t = useTranslations("common");
  return (
    <Dialog
      closeLabel={t("actions.close")}
      dismissible={!busy}
      footer={
        <>
          <Button disabled={busy} onClick={onClose}>
            {t("actions.cancel")}
          </Button>
          <Button busy={busy} form={formId} icon={<Save aria-hidden="true" className="size-4" />} type="submit" variant="primary">
            {submitLabel ?? t("actions.save")}
          </Button>
        </>
      }
      onClose={onClose}
      open={open}
      size={size}
      title={title}
    >
      <UnsavedChangesGuard when={open && dirty} />
      <form
        className="flex flex-col gap-4"
        id={formId}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        {error === null || error === undefined ? null : <ErrorAlert action={errorAction} error={error} />}
        {children}
      </form>
    </Dialog>
  );
}
