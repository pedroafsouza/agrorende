import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

const control =
  "min-h-12 w-full rounded-controls border border-[var(--ar-border-strong)] bg-[var(--ar-surface)] px-3 text-base text-[var(--ar-text)] placeholder:text-[var(--ar-text-muted)] focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-[var(--ar-focus)] aria-[invalid=true]:border-[var(--ar-danger)] aria-[invalid=true]:border-2";

export interface FieldProps {
  readonly label: string;
  readonly hint?: string;
  readonly error?: string;
  readonly required?: boolean;
  readonly children: (props: { id: string; "aria-invalid": boolean; "aria-describedby": string | undefined }) => ReactNode;
  readonly className?: string;
}

/** Label above the control, inline error under it with an icon and words (A§3.7, REC-02). */
export function Field({ label, hint, error, required = false, children, className }: FieldProps) {
  const id = useId();
  const describedBy = [hint === undefined ? null : `${id}-hint`, error === undefined ? null : `${id}-error`].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <label className="text-sm font-semibold text-[var(--ar-text)]" htmlFor={id}>
        {label}
        {required ? <span aria-hidden="true" className="ml-1 text-[var(--ar-danger)]">*</span> : null}
      </label>
      {children({ id, "aria-invalid": error !== undefined, "aria-describedby": describedBy })}
      {hint === undefined ? null : (
        <p className="text-sm text-[var(--ar-text-muted)]" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      {error === undefined ? null : (
        <p className="flex items-center gap-1 text-sm font-semibold text-[var(--ar-danger)]" id={`${id}-error`} role="alert">
          <span aria-hidden="true">⚠</span>
          {error}
        </p>
      )}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input className={cn(control, className)} ref={ref} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea className={cn(control, "min-h-24 py-2", className)} ref={ref} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, ...rest }, ref) {
  return <select className={cn(control, "pr-8", className)} ref={ref} {...rest} />;
});

export function Checkbox({ label, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { readonly label: string }) {
  return (
    <label className={cn("flex min-h-12 cursor-pointer items-center gap-3 text-base text-[var(--ar-text)]", className)}>
      <input className="size-5 accent-[var(--ar-primary)]" type="checkbox" {...rest} />
      {label}
    </label>
  );
}
