import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

/** Page title row: optional back link, title, subtitle and right-aligned actions. */
export function PageHeader({ title, subtitle, actions, back }: { readonly title: string; readonly subtitle?: ReactNode; readonly actions?: ReactNode; readonly back?: { href: string; label: string } }) {
  return (
    <header className="flex flex-col gap-2">
      {back === undefined ? null : (
        <Link className="inline-flex min-h-12 w-fit items-center gap-2 text-sm font-semibold text-[var(--ar-link)]" href={back.href}>
          <ArrowLeft aria-hidden="true" className="size-4" />
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {subtitle === undefined ? null : <div className="mt-1 text-[var(--ar-text-muted)]">{subtitle}</div>}
        </div>
        {actions === undefined ? null : <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </header>
  );
}
