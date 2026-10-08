import type { ReactNode } from "react";

/** One label/value pair inside a `<dl>`; empty values render as an em dash. */
export function Detail({ label, value }: { readonly label: string; readonly value: ReactNode }) {
  const empty = value === null || value === undefined || value === "";
  return (
    <div>
      <dt className="text-sm text-[var(--ar-text-muted)]">{label}</dt>
      <dd className="font-semibold break-words">{empty ? "—" : value}</dd>
    </div>
  );
}

export function Card({ title, children, className = "", actions }: { readonly title?: string; readonly children: ReactNode; readonly className?: string; readonly actions?: ReactNode }) {
  return (
    <section className={`rounded-cards border border-[var(--ar-border)] bg-[var(--ar-surface)] p-4 ${className}`}>
      {title === undefined && actions === undefined ? null : (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {title === undefined ? null : <h2 className="flex-1 text-lg font-semibold">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}
