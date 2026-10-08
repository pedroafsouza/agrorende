import { AlertTriangle, CircleCheck, Clock, Lock, MessageCircle, Settings } from "lucide-react";
import type { ReactNode } from "react";

import { buttonVariants } from "@/components/ui/Button";

export type OrgStatusBannerTone = "trial" | "active" | "past_due" | "suspended" | "cancelled";

export interface OrgStatusBannerProps {
  readonly tone: OrgStatusBannerTone;
  readonly title: string;
  readonly body: string;
  readonly actionLabel?: string;
  /** Turns the action into a link; without it the action label is not rendered (no dead buttons). */
  readonly actionHref?: string;
  readonly actionKind?: "subscription" | "whatsapp";
}

const toneClassName = {
  trial: "border-[var(--ar-info)] bg-[var(--ar-info-bg)]",
  active: "border-[var(--ar-success)] bg-[var(--ar-success-bg)]",
  past_due: "border-[var(--ar-warning)] bg-[var(--ar-warning-bg)]",
  suspended: "border-[var(--ar-danger)] bg-[var(--ar-danger-bg)]",
  cancelled: "border-[var(--ar-border-strong)] bg-[var(--ar-surface-muted)]",
} satisfies Record<OrgStatusBannerTone, string>;

const toneIcon = {
  trial: <Clock aria-hidden="true" className="size-6 shrink-0 text-[var(--ar-info-text)]" />,
  active: <CircleCheck aria-hidden="true" className="size-6 shrink-0 text-[var(--ar-success-text)]" />,
  past_due: <AlertTriangle aria-hidden="true" className="size-6 shrink-0 text-[var(--ar-warning-text)]" />,
  suspended: <Lock aria-hidden="true" className="size-6 shrink-0 text-[var(--ar-danger-text)]" />,
  cancelled: <Lock aria-hidden="true" className="size-6 shrink-0 text-[var(--ar-text-muted)]" />,
} satisfies Record<OrgStatusBannerTone, ReactNode>;

/** Organisation status strip shown above office pages: icon plus words, never colour alone (A§3.7). */
export function OrgStatusBanner({ actionHref, actionKind = "subscription", actionLabel, body, title, tone }: OrgStatusBannerProps) {
  const urgent = tone === "suspended" || tone === "past_due";
  return (
    <section
      aria-live={urgent ? "polite" : undefined}
      className={`flex flex-col gap-3 rounded-cards border-l-4 border-y border-r p-4 text-[var(--ar-text)] sm:flex-row sm:items-center ${toneClassName[tone]}`}
      data-tone={tone}
      role={urgent ? "status" : undefined}
    >
      <div className="flex flex-1 items-start gap-3">
        {toneIcon[tone]}
        <div className="min-w-0">
          <h2 className="text-base font-semibold">{title}</h2>
          <p className="mt-1 text-sm">{body}</p>
        </div>
      </div>
      {actionLabel === undefined || actionHref === undefined ? null : (
        <a
          className={buttonVariants({ variant: tone === "suspended" ? "primary" : "secondary" })}
          href={actionHref}
          {...(actionKind === "whatsapp" ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        >
          {actionKind === "whatsapp" ? <MessageCircle aria-hidden="true" className="size-5" /> : <Settings aria-hidden="true" className="size-5" />}
          {actionLabel}
        </a>
      )}
    </section>
  );
}
