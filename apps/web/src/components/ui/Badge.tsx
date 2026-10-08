import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

export type Tone = "success" | "warning" | "danger" | "info" | "neutral" | "primary";

const toneClass: Record<Tone, string> = {
  success: "border-[var(--ar-success)] text-[var(--ar-success-text)] bg-[var(--ar-success-bg)]",
  warning: "border-[var(--ar-warning)] text-[var(--ar-warning-text)] bg-[var(--ar-warning-bg)]",
  danger: "border-[var(--ar-danger)] text-[var(--ar-danger-text)] bg-[var(--ar-danger-bg)]",
  info: "border-[var(--ar-info)] text-[var(--ar-info-text)] bg-[var(--ar-info-bg)]",
  neutral: "border-[var(--ar-border-strong)] text-[var(--ar-text)] bg-[var(--ar-surface-muted)]",
  primary: "border-[var(--ar-primary)] text-[var(--ar-primary-text)] bg-[var(--ar-primary-bg)]",
};

/** Status is never colour alone: every badge carries an icon and a word (A§3.7). */
export function Badge({ tone, icon, children, className }: { readonly tone: Tone; readonly icon?: ReactNode; readonly children: ReactNode; readonly className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-sm font-semibold", toneClass[tone], className)}>
      {icon === undefined ? null : <span aria-hidden="true" className="inline-flex size-4 items-center justify-center">{icon}</span>}
      {children}
    </span>
  );
}
