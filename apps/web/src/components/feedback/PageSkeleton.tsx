"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

import "./feedback.css";

import { Lottie } from "@/components/motion/Lottie";
import { cn } from "@/lib/cn";

/** Waits longer than this add the small `loading` animation and the "Carregando…" line. */
export const SLOW_LOADING_MS = 2000;

export type PageSkeletonVariant = "list" | "dashboard" | "detail" | "form";

/** True once `delayMs` has passed since mount. */
export function useSlowLoading(delayMs: number = SLOW_LOADING_MS): boolean {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs]);
  return slow;
}

/** One shimmering placeholder block; with reduced motion it is a flat muted block. */
export function Skeleton({ className, style }: { readonly className?: string; readonly style?: CSSProperties }) {
  return <span aria-hidden="true" className={cn("ar-skeleton rounded-controls", className)} data-skeleton="" style={style} />;
}

/**
 * Floats over the skeleton so it never shifts the layout when it appears. The animation plays one
 * cycle and then rests, so it stays inside the five-second limit of WCAG 2.2.2 without a pause
 * control; the text carries the meaning.
 */
export function SlowLoadingNotice({ className }: { readonly className?: string }) {
  const t = useTranslations("common");
  return (
    <div className={cn("pointer-events-none absolute inset-x-0 top-28 flex justify-center", className)} data-testid="slow-loading">
      <div className="flex items-center gap-3 rounded-cards border border-[var(--ar-border)] bg-[var(--ar-surface)] py-2 pr-4 pl-2 shadow-sm">
        <Lottie className="w-16" id="loading" playOnce />
        <span className="font-semibold">{t("states.loading")}</span>
      </div>
    </div>
  );
}

function HeaderSkeleton({ back = false, action = true }: { readonly back?: boolean; readonly action?: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      {back ? <Skeleton className="my-3.5 h-5 w-28" /> : null}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Skeleton className="h-8 w-56 max-w-full" />
          <Skeleton className="h-5 w-80 max-w-full" />
        </div>
        {action ? <Skeleton className="h-12 w-40" /> : null}
      </div>
    </div>
  );
}

function CardSkeleton({ className, children }: { readonly className?: string; readonly children: ReactNode }) {
  return <div className={cn("rounded-cards border border-[var(--ar-border)] bg-[var(--ar-surface)] p-4", className)}>{children}</div>;
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <HeaderSkeleton />
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-12 w-72 max-w-full" />
        <Skeleton className="h-12 w-36" />
        <Skeleton className="h-12 w-36" />
      </div>
      <CardSkeleton className="flex flex-col gap-0 p-0">
        <div className="flex gap-4 border-b border-[var(--ar-border)] px-4 py-3">
          {[40, 20, 16, 14].map((w) => (
            <Skeleton className="h-4" key={w} style={{ width: `${w}%` }} />
          ))}
        </div>
        {Array.from({ length: 8 }, (_, i) => (
          <div className="flex min-h-14 items-center gap-4 border-b border-[var(--ar-border)] px-4 last:border-b-0" key={i}>
            <Skeleton className="h-5" style={{ width: `${32 + ((i * 7) % 12)}%` }} />
            <Skeleton className="h-5 w-[18%]" />
            <Skeleton className="h-6 w-[12%] rounded-full" />
            <Skeleton className="h-5 w-[14%]" />
          </div>
        ))}
      </CardSkeleton>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <HeaderSkeleton />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <CardSkeleton className="flex flex-col gap-3" key={i}>
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-16" />
          </CardSkeleton>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Skeleton className="h-[28rem] rounded-cards" />
        <div className="flex flex-col gap-3">
          <Skeleton className="h-5 w-32" />
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton className="h-16 rounded-cards" key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <HeaderSkeleton back />
      <div className="grid gap-6 lg:grid-cols-3">
        <CardSkeleton className="flex flex-col gap-4 lg:col-span-2">
          <Skeleton className="h-6 w-40" />
          <div className="grid gap-4 sm:grid-cols-3">
            {Array.from({ length: 9 }, (_, i) => (
              <div className="flex flex-col gap-1.5" key={i}>
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-5 w-28" />
              </div>
            ))}
          </div>
        </CardSkeleton>
        <CardSkeleton className="flex flex-col gap-3">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-56 rounded-cards" />
        </CardSkeleton>
      </div>
      <CardSkeleton className="flex flex-col gap-3">
        <Skeleton className="h-6 w-36" />
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton className="h-12" key={i} />
        ))}
      </CardSkeleton>
    </div>
  );
}

function FormSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <HeaderSkeleton action={false} back />
      <CardSkeleton className="flex max-w-3xl flex-col gap-5">
        <div className="grid gap-5 sm:grid-cols-2">
          {Array.from({ length: 6 }, (_, i) => (
            <div className="flex flex-col gap-2" key={i}>
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-12" />
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-24" />
        </div>
      </CardSkeleton>
      <div className="flex max-w-3xl justify-end gap-2">
        <Skeleton className="h-12 w-28" />
        <Skeleton className="h-14 w-40" />
      </div>
    </div>
  );
}

const VARIANTS = { list: ListSkeleton, dashboard: DashboardSkeleton, detail: DetailSkeleton, form: FormSkeleton } as const;

/**
 * Route-level loading placeholder shaped like the page that is coming (list/table, dashboard
 * with KPIs and map, detail, form). It is announced once as "Carregando…"; after two seconds a
 * small animation joins the text so a slow network does not look frozen.
 */
export function PageSkeleton({ variant = "list" }: { readonly variant?: PageSkeletonVariant }) {
  const t = useTranslations("common");
  const slow = useSlowLoading();
  const Layout = VARIANTS[variant];
  return (
    <div aria-busy="true" aria-live="polite" className="relative" data-testid="page-skeleton" data-variant={variant} role="status">
      <span className="sr-only">{t("states.loading")}</span>
      <Layout />
      {slow ? <SlowLoadingNotice /> : null}
    </div>
  );
}
