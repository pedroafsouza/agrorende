import { Sprout } from "lucide-react";
import type { ReactNode } from "react";

/** Centered card used by every signed-out page: login, change password, invite and reset. */
export function AuthCard({ title, subtitle, children, brand }: { readonly title: string; readonly subtitle?: ReactNode; readonly children: ReactNode; readonly brand: string }) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 rounded-cards border border-[var(--ar-border)] bg-[var(--ar-surface)] p-6 shadow-sm">
      <div className="flex items-center gap-2 text-[var(--ar-primary-text)]">
        <Sprout aria-hidden="true" className="size-7" />
        <span className="text-lg font-bold">{brand}</span>
      </div>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle === undefined ? null : <div className="mt-1 text-[var(--ar-text-muted)]">{subtitle}</div>}
      </div>
      {children}
    </div>
  );
}
