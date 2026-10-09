import { type ReactNode } from "react";

import { container } from "@/components/ui";

export function PageIntro({ title, lead, children }: { readonly title: string; readonly lead?: string; readonly children?: ReactNode }) {
  return (
    <div className="border-b border-border bg-surface">
      <div className={`${container} py-14 sm:py-16`}>
        {children}
        <h1 className="accent-rule max-w-3xl text-4xl font-bold tracking-tight text-balance sm:text-5xl">{title}</h1>
        {lead !== undefined ? <p className="mt-4 max-w-2xl text-lg text-pretty text-fg-muted">{lead}</p> : null}
      </div>
    </div>
  );
}
