"use client";

import { Inbox, WifiOff } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import type { AnimationId } from "@agrorende/motion";

import { Skeleton, SlowLoadingNotice, useSlowLoading } from "@/components/feedback/PageSkeleton";
import { Lottie } from "@/components/motion/Lottie";
import { ErrorAlert } from "@/components/recovery/ErrorAlert";

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

export function QueryState({ isLoading, error, isEmpty, empty, onRetry, children }: { readonly isLoading: boolean; readonly error: unknown; readonly isEmpty: boolean; readonly empty: ReactNode; readonly onRetry: () => void; readonly children: ReactNode }) {
  if (isLoading) return <LoadingState />;
  if (error !== null && error !== undefined) return <ErrorAlert error={error} onRetry={onRetry} />;
  if (isEmpty) return <>{empty}</>;
  return <>{children}</>;
}
