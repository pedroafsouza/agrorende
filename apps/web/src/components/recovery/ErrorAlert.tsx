"use client";

import { AlertTriangle, Copy, RotateCw } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/Button";

import { useErrorCopy } from "./errorCopy";

export interface ErrorAlertProps {
  readonly error: unknown;
  readonly onRetry?: () => void;
  /** Extra recovery action, e.g. "Archive instead" for RECORD_IN_USE. */
  readonly action?: ReactNode;
  readonly compact?: boolean;
}

/** Inline error with what happened, what is safe, what to do next and a support reference (REC-01, REC-03). */
export function ErrorAlert({ error, onRetry, action, compact = false }: ErrorAlertProps) {
  const copy = useErrorCopy()(error);
  const t = useTranslations("common");
  return (
    <div className="rounded-cards border-2 border-[var(--ar-danger)] bg-[var(--ar-danger-bg)] p-4 text-[var(--ar-text)]" role="alert">
      <div className="flex items-start gap-3">
        <AlertTriangle aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-[var(--ar-danger)]" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{copy.title}</p>
          {compact ? null : <p className="mt-1 text-sm">{copy.body}</p>}
          {copy.ref === undefined ? null : (
            <p className="mt-2 flex items-center gap-2 text-xs text-[var(--ar-text-muted)]">
              <span>{t("errors.reference", { ref: copy.ref })}</span>
              <button
                aria-label={t("errors.copyReference")}
                className="inline-flex size-8 min-h-0 items-center justify-center rounded-controls hover:bg-[var(--ar-surface-muted)]"
                onClick={() => void navigator.clipboard?.writeText(copy.ref ?? "")}
                type="button"
              >
                <Copy aria-hidden="true" className="size-4" />
              </button>
            </p>
          )}
          {onRetry === undefined && action === undefined ? null : (
            <div className="mt-3 flex flex-wrap gap-2">
              {onRetry === undefined || !copy.retryable ? null : (
                <Button icon={<RotateCw aria-hidden="true" className="size-4" />} onClick={onRetry}>
                  {t("actions.retry")}
                </Button>
              )}
              {action}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
