import { Check, Circle } from "lucide-react";
import Link from "next/link";

export interface GettingStartedStep {
  readonly id: string;
  readonly label: string;
  readonly completed: boolean;
  /** Where the ADMIN goes to finish the step; completed steps render as plain text. */
  readonly href?: string;
}

export interface GettingStartedCardProps {
  readonly title: string;
  readonly steps: readonly GettingStartedStep[];
  /** For example "2 of 4 done"; announced together with the title. */
  readonly progressLabel?: string;
  readonly completedLabel?: string;
}

/** First-run checklist for a new organisation (TEN-10). The steps are a real sequence, so they are numbered. */
export function GettingStartedCard({ completedLabel, progressLabel, steps, title }: GettingStartedCardProps) {
  const done = steps.filter((step) => step.completed).length;
  return (
    <section aria-labelledby="getting-started-title" className="rounded-cards border border-[var(--ar-border)] bg-[var(--ar-surface)] p-4 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-[var(--ar-text)]" id="getting-started-title">
          {title}
        </h2>
        {progressLabel === undefined ? null : <p className="text-sm text-[var(--ar-text-muted)]">{progressLabel}</p>}
      </div>
      <div aria-hidden="true" className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--ar-surface-muted)]">
        <div className="h-full rounded-full bg-[var(--ar-primary)]" style={{ width: `${steps.length === 0 ? 0 : Math.round((done / steps.length) * 100)}%` }} />
      </div>
      <ol className="mt-4 grid gap-2">
        {steps.map((step, index) => {
          const content = (
            <>
              <span
                aria-hidden="true"
                className={`flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${step.completed ? "bg-[var(--ar-primary)] text-[var(--ar-on-primary)]" : "border-2 border-[var(--ar-border-strong)] text-[var(--ar-text)]"}`}
              >
                {step.completed ? <Check className="size-4" /> : index + 1}
              </span>
              <span className={step.completed ? "text-[var(--ar-text-muted)] line-through" : "font-semibold"}>{step.label}</span>
              {step.completed && completedLabel !== undefined ? <span className="sr-only">{completedLabel}</span> : null}
              {step.completed ? null : <Circle aria-hidden="true" className="ml-auto size-4 text-[var(--ar-text-muted)]" />}
            </>
          );
          return (
            <li data-completed={step.completed} key={step.id}>
              {step.href !== undefined && !step.completed ? (
                <Link className="flex min-h-12 items-center gap-3 rounded-controls border border-[var(--ar-border)] px-3 py-2 text-sm text-[var(--ar-text)] hover:bg-[var(--ar-surface-muted)] focus-visible:outline-3 focus-visible:outline-[var(--ar-focus)]" href={step.href}>
                  {content}
                </Link>
              ) : (
                <div className="flex min-h-12 items-center gap-3 rounded-controls border border-transparent px-3 py-2 text-sm">{content}</div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
