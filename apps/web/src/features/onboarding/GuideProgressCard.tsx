"use client";

import { ArrowRight, X } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { Lottie } from "@/components/motion/Lottie";
import { showUndoToast } from "@/components/recovery/UndoToast";
import { Button, buttonVariants } from "@/components/ui/Button";
import { useMe } from "@/features/shell/useMe";

import { useGuideModal } from "./GuideModal";
import { useGuideState } from "./guideStorage";
import { useGuideProgress } from "./useGuideProgress";

export const GUIDE_HREF = "/getting-started";

/**
 * Compact "Primeiros passos: 2 de 4 tarefas" card for the overview (SIMPLER-TO-SELL §4). ADMIN
 * only; it disappears when every task is done, when the admin hides it or finishes the guide.
 * Hiding offers an undo toast, and the guide stays reachable from the user menu and the command
 * palette. "Continuar" opens the guide modal; `GuideModalProvider` offers it once to a brand-new
 * organisation.
 */
export function GuideProgressCard() {
  const t = useTranslations("tenancy.guide");
  const guide = useGuideModal();
  const me = useMe();
  const isAdmin = me.data?.user.role === "ADMIN";
  const progress = useGuideProgress(isAdmin);
  const { state, ready, update } = useGuideState(me.data?.org?.id ?? me.data?.user.id);
  if (!isAdmin || !ready || !progress.isReady || progress.complete || state.dismissed === true || state.finished === true) return null;
  const percent = Math.round((progress.done / progress.total) * 100);
  const hide = () => {
    update({ dismissed: true });
    showUndoToast(t("card.hidden"), t("card.undo"), () => update({ dismissed: false }));
  };
  return (
    <section aria-labelledby="guide-card-title" className="flex flex-col gap-4 rounded-cards border border-[var(--ar-border)] bg-[var(--ar-surface)] p-4 sm:flex-row sm:items-center sm:gap-6" data-testid="guide-progress-card">
      <Lottie className="hidden w-28 shrink-0 sm:block" id="welcome" playOnce />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="text-lg font-semibold" id="guide-card-title">
            {t("card.title")}
          </h2>
          <span className="text-sm font-semibold text-[var(--ar-primary-text)]">{t("card.progress", { done: progress.done, total: progress.total })}</span>
        </div>
        <p className="text-sm text-[var(--ar-text-muted)]">{t("card.body")}</p>
        <div
          aria-label={t("card.progress", { done: progress.done, total: progress.total })}
          aria-valuemax={progress.total}
          aria-valuemin={0}
          aria-valuenow={progress.done}
          className="h-2 overflow-hidden rounded-full border-[var(--ar-border)] bg-[var(--ar-surface-muted)] [html[data-theme=outdoor]_&]:border"
          role="progressbar"
        >
          <div className="h-full rounded-full bg-[var(--ar-primary)]" style={{ width: `${percent}%` }} />
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {guide === null ? (
          <Link className={buttonVariants({ variant: "primary" })} href={GUIDE_HREF}>
            {t("card.continue")}
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        ) : (
          <Button aria-haspopup="dialog" data-testid="guide-card-open" onClick={guide.open} variant="primary">
            {t("card.continue")}
            <ArrowRight aria-hidden="true" className="size-4" />
          </Button>
        )}
        <Button icon={<X aria-hidden="true" className="size-4" />} onClick={hide} variant="ghost">
          {t("card.hide")}
        </Button>
      </div>
    </section>
  );
}
