"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";

import { cn } from "@/lib/cn";

export interface DialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title: string;
  readonly description?: string;
  readonly closeLabel: string;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
  readonly size?: "md" | "lg";
  /** Blocks Escape and backdrop close, e.g. while a write is in flight or for the re-auth prompt. */
  readonly dismissible?: boolean;
  /** Extra classes for the `<dialog>` box, e.g. to place the command palette near the top. */
  readonly className?: string;
}

/** Native `<dialog>` modal: focus trap, Escape and inert background come from the platform. */
export function Dialog({ open, onClose, title, description, closeLabel, children, footer, size = "md", dismissible = true, className }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  // Unique ids keep the accessible name right when several dialogs are mounted on one page.
  const titleId = `${useId()}-title`;
  const descriptionId = `${titleId}-description`;

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      aria-describedby={description === undefined ? undefined : descriptionId}
      aria-labelledby={titleId}
      className={cn(
        "m-auto w-[calc(100%-2rem)] rounded-sheets border border-[var(--ar-border)] bg-[var(--ar-surface)] p-0 text-[var(--ar-text)] shadow-xl backdrop:bg-black/50",
        size === "lg" ? "max-w-3xl" : "max-w-lg",
        className,
      )}
      onCancel={(event) => {
        event.preventDefault();
        if (dismissible) onClose();
      }}
      ref={ref}
    >
      {open ? (
        <div className="flex max-h-[85vh] flex-col">
          <header className="flex items-start gap-3 border-b border-[var(--ar-border)] p-4">
            <div className="flex-1">
              <h2 className="text-lg font-semibold" id={titleId}>
                {title}
              </h2>
              {description === undefined ? null : (
                <p className="mt-1 text-sm text-[var(--ar-text-muted)]" id={descriptionId}>
                  {description}
                </p>
              )}
            </div>
            {dismissible ? (
              <button aria-label={closeLabel} className="flex size-12 items-center justify-center rounded-controls hover:bg-[var(--ar-surface-muted)]" onClick={onClose} type="button">
                <X aria-hidden="true" className="size-5" />
              </button>
            ) : null}
          </header>
          <div className="flex-1 overflow-y-auto p-4">{children}</div>
          {footer === undefined ? null : <footer className="flex flex-wrap justify-end gap-2 border-t border-[var(--ar-border)] p-4">{footer}</footer>}
        </div>
      ) : null}
    </dialog>
  );
}
