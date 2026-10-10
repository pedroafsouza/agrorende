"use client";

import { Inbox, WifiOff } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import type { AnimationId } from "@agrorende/motion";

import { Skeleton, SlowLoadingNotice, useSlowLoading } from "@/components/feedback/PageSkeleton";
import { Lottie } from "@/components/motion/Lottie";
import { ErrorAlert } from "@/components/recovery/ErrorAlert";
import { cn } from "@/lib/cn";

/** The four screen states every list and detail renders (A§19, UX-03): loading, empty, error, offline. */
export function LoadingState({ rows = 5 }: { readonly rows?: number }) {
  const t = useTranslations("common");
  const slow = useSlowLoading();
  return (
    <div aria-busy="true" aria-live="polite" className="relative flex flex-col gap-2" role="status">
      <span className="sr-only">{t("states.loading")}</span>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton className="h-12" key={i} />
      ))}
      {slow ? <SlowLoadingNotice className="top-1/2 -translate-y-1/2" /> : null}
    </div>
  );
}

/** Loading placeholder shaped like a `DataTable`: same border, a header bar and 57 px rows, so the page does not jump when data arrives. */
export function TableLoadingState({ rows = 6 }: { readonly rows?: number }) {
  const t = useTranslations("common");
  const slow = useSlowLoading();
  return (
    <div aria-busy="true" aria-live="polite" className="relative overflow-hidden rounded-cards border border-[var(--ar-border)] bg-[var(--ar-surface)]" data-testid="table-loading" role="status">
      <span className="sr-only">{t("states.loading")}</span>
      <div className="h-12 bg-[var(--ar-surface-muted)]" />
      {Array.from({ length: rows }, (_, i) => (
        <div className="flex h-14 items-center border-t border-[var(--ar-border)] px-4" key={i}>
          <Skeleton className="h-5 w-full" />
        </div>
      ))}
      {slow ? <SlowLoadingNotice className="top-1/2 -translate-y-1/2" /> : null}
    </div>
  );
}

/**
 * Empty list: what the page is for and the one next step (SIMPLER-TO-SELL §2). Pass `animation`
 * (`empty` or a page-specific one) to show a Lottie instead of the icon.
 */
export function EmptyState({ title, body, action, icon, animation }: { readonly title: string; readonly body?: string; readonly action?: ReactNode; readonly icon?: ReactNode; readonly animation?: AnimationId }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-cards border border-dashed border-[var(--ar-border-strong)] bg-[var(--ar-surface)] p-8 text-center">
      {animation === undefined ? (
        <span aria-hidden="true" className="text-[var(--ar-text-muted)]">
          {icon ?? <Inbox className="size-8" />}
        </span>
      ) : (
        <Lottie className="max-w-60" id={animation} />
      )}
      <p className="text-lg font-semibold">{title}</p>
      {body === undefined ? null : <p className="max-w-md text-[var(--ar-text-muted)]">{body}</p>}
      {action}
    </div>
  );
}

export function OfflineState({ onRetry }: { readonly onRetry?: () => void }) {
  const t = useTranslations("common");
  return (
    <div className="flex items-center gap-3 rounded-cards border-2 border-[var(--ar-text)] bg-[var(--ar-surface)] p-4" role="status">
      <WifiOff aria-hidden="true" className="size-5" />
      <div className="flex-1">
        <p className="font-semibold">{t("offline.title")}</p>
        <p className="text-sm">{t("offline.body")}</p>
      </div>
      {onRetry === undefined ? null : (
        <button className="min-h-12 rounded-controls border border-[var(--ar-border-strong)] px-4 font-semibold" onClick={onRetry} type="button">
          {t("actions.retry")}
        </button>
      )}
    </div>
  );
}

/**
 * Wraps results that stay on screen while new filters load (`placeholderData`): they dim and the
 * region reports itself busy, instead of collapsing to a skeleton and making the page jump.
 */
export function RefreshingFrame({ isRefreshing, className, children }: { readonly isRefreshing: boolean; readonly className?: string; readonly children: ReactNode }) {
  return (
    <div aria-busy={isRefreshing || undefined} className={cn("transition-opacity motion-reduce:transition-none", isRefreshing && "opacity-60", className)} data-testid="refreshing-frame">
      {children}
    </div>
  );
}

export function QueryState({ isLoading, error, isEmpty, empty, onRetry, children, loading }: { readonly isLoading: boolean; readonly error: unknown; readonly isEmpty: boolean; readonly empty: ReactNode; readonly onRetry: () => void; readonly children: ReactNode; readonly loading?: ReactNode }) {
  if (isLoading) return <>{loading ?? <LoadingState />}</>;
  if (error !== null && error !== undefined) return <ErrorAlert error={error} onRetry={onRetry} />;
  if (isEmpty) return <>{empty}</>;
  return <>{children}</>;
}
