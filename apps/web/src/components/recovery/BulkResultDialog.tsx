"use client";

import { CheckCircle2, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";

import { useErrorCopy } from "./errorCopy";

export interface BulkResultItem {
  readonly id: string;
  readonly label: string;
  readonly ok: boolean;
  readonly error?: unknown;
}

/** Per-item outcome of a bulk action, with a retry for the failures only (EC-ADM-07). */
export function BulkResultDialog({ open, items, onClose, onRetryFailed }: { readonly open: boolean; readonly items: readonly BulkResultItem[]; readonly onClose: () => void; readonly onRetryFailed?: (ids: string[]) => void }) {
  const t = useTranslations("common");
  const copy = useErrorCopy();
  const failed = items.filter((item) => !item.ok);
  return (
    <Dialog
      closeLabel={t("actions.close")}
      description={t("bulk.summary", { ok: items.length - failed.length, failed: failed.length })}
      footer={
        <>
          {failed.length > 0 && onRetryFailed !== undefined ? <Button onClick={() => onRetryFailed(failed.map((item) => item.id))}>{t("bulk.retryFailed")}</Button> : null}
          <Button onClick={onClose} variant="primary">
            {t("actions.done")}
          </Button>
        </>
      }
      onClose={onClose}
      open={open}
      title={t("bulk.title")}
    >
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li className="flex items-start gap-2" key={item.id}>
            {item.ok ? <CheckCircle2 aria-hidden="true" className="size-5 text-[var(--ar-success)]" /> : <XCircle aria-hidden="true" className="size-5 text-[var(--ar-danger)]" />}
            <span className="flex-1">
              <span className="font-semibold">{item.label}</span>
              <span className="ml-2 text-sm">{item.ok ? t("bulk.ok") : copy(item.error).title}</span>
            </span>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
