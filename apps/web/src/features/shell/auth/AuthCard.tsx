import type { ReactNode } from "react";

import { BrandLogo } from "@/components/brand/BrandLogo";

/** Centered card used by every signed-out page: login, change password, invite and reset. */
export function AuthCard({ title, subtitle, children, brand }: { readonly title: string; readonly subtitle?: ReactNode; readonly children: ReactNode; readonly brand: string }) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 rounded-cards border border-[var(--ar-border)] bg-[var(--ar-surface)] p-6 shadow-sm">
      <BrandLogo className="h-10 w-auto self-start" title={brand} />
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle === undefined ? null : <div className="mt-1 text-[var(--ar-text-muted)]">{subtitle}</div>}
      </div>
      {children}
    </div>
  );
}
