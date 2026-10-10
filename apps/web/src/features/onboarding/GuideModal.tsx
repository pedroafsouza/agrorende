"use client";

import { Flag, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { prefersReducedMotion } from "@/components/feedback/RouteMotion";
import { useMe } from "@/features/shell/useMe";

import { GuideFlow } from "./GuidePage";
import { useGuideState } from "./guideStorage";
import { useGuideProgress } from "./useGuideProgress";

export const GUIDE_ENTER_MS = 220;
export const GUIDE_EXIT_MS = 150;
const SHEET_ENTER_MS = 280;
const SPRING = "cubic-bezier(0.22, 1.2, 0.36, 1)";
const EASE_IN = "cubic-bezier(0.4, 0, 1, 1)";
const SHEET_QUERY = "(max-width: 639.98px)";

interface GuideModalApi {
  /** Opens the guide over the current page. Focus returns to whatever had it when called. */
  readonly open: () => void;
  readonly close: () => void;
  readonly isOpen: boolean;
}

const GuideModalContext = createContext<GuideModalApi | null>(null);

/** `null` outside the provider, so callers can fall back to a plain link to `/getting-started`. */
export function useGuideModal(): GuideModalApi | null {
  return useContext(GuideModalContext);
}

function isSheet(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia(SHEET_QUERY).matches;
}

function panelKeyframes(reduced: boolean, sheet: boolean): Keyframe[] {
  if (reduced) return [{ opacity: 0 }, { opacity: 1 }];
  if (sheet) return [{ transform: "translateY(100%)" }, { transform: "translateY(0)" }];
  return [
    { opacity: 0, transform: "translateY(8px) scale(0.96)" },
    { opacity: 1, transform: "translateY(0) scale(1)" },
  ];
}

/**
 * Hosts the "Primeiros passos" guide as a floating modal for the whole admin shell. It opens by
 * itself once for a brand-new organisation (same `agrorende.guide.v1.<orgId>` state as before),
 * and on demand from the user menu, the command palette, the overview card and `/getting-started`.
 */
export function GuideModalProvider({ children }: { readonly children: ReactNode }) {
  const me = useMe();
  const isAdmin = me.data?.user.role === "ADMIN";
  const progress = useGuideProgress(isAdmin);
  const { state, ready, update } = useGuideState(me.data?.org?.id ?? me.data?.user.id);
  const [isOpen, setOpen] = useState(false);
  const triggerRef = useRef<HTMLElement | null>(null);

  const open = useCallback(() => {
    const active = document.activeElement;
    triggerRef.current = active instanceof HTMLElement && active !== document.body ? active : null;
    // A menu or the palette that called us closes in the same tick; let it give focus back first.
    window.setTimeout(() => {
      const settled = document.activeElement;
      if (triggerRef.current === null || !triggerRef.current.isConnected) triggerRef.current = settled instanceof HTMLElement && settled !== document.body ? settled : null;
      setOpen(true);
    }, 0);
  }, []);
  const close = useCallback(() => setOpen(false), []);

  const brandNew = progress.isReady && !progress.tasks.machine;
  const shouldOffer = isAdmin && ready && brandNew && state.offered !== true && state.dismissed !== true && state.finished !== true;
  useEffect(() => {
    if (!shouldOffer) return;
    update({ offered: true });
    open();
  }, [open, shouldOffer, update]);

  const api = useMemo(() => ({ open, close, isOpen }), [open, close, isOpen]);
  return (
    <GuideModalContext.Provider value={api}>
      {children}
      {isAdmin ? <GuideModal onClosed={() => restoreFocus(triggerRef.current)} onRequestClose={close} open={isOpen} /> : null}
    </GuideModalContext.Provider>
  );
}

function restoreFocus(element: HTMLElement | null): void {
  if (element !== null && element.isConnected) element.focus();
}

/**
 * Native modal `<dialog>`: the platform makes the page behind it inert, keeps Tab inside and turns
 * Escape into a cancel. Desktop: centred 720 px card that scales and rises in with a soft spring.
 * Phones: a bottom sheet that slides up. Reduced motion: a plain fade.
 */
export function GuideModal({ open, onRequestClose, onClosed }: { readonly open: boolean; readonly onRequestClose: () => void; readonly onClosed: () => void }) {
  const t = useTranslations("tenancy.guide");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const titleId = `${useId()}-title`;
  const onClosedRef = useRef(onClosed);
  onClosedRef.current = onClosed;

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return undefined;
    const reduced = prefersReducedMotion();
    const sheet = isSheet();
    if (open) {
      setMounted(true);
      if (!dialog.open) dialog.showModal();
      dialog.setAttribute("data-state", "open");
      const root = document.documentElement;
      const overflow = root.style.overflow;
      root.style.overflow = "hidden";
      const panel = panelRef.current;
      if (panel !== null && typeof panel.animate === "function") {
        panel.animate(panelKeyframes(reduced, sheet), { duration: reduced ? GUIDE_EXIT_MS : sheet ? SHEET_ENTER_MS : GUIDE_ENTER_MS, easing: reduced ? "ease-out" : SPRING });
        backdropRef.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: GUIDE_ENTER_MS, easing: "ease-out" });
      }
      return () => {
        root.style.overflow = overflow;
      };
    }
    if (!dialog.open) return undefined;
    dialog.setAttribute("data-state", "closing");
    const finish = () => {
      if (dialog.open) dialog.close();
      dialog.removeAttribute("data-state");
      setMounted(false);
      onClosedRef.current();
    };
    const panel = panelRef.current;
    if (panel === null || typeof panel.animate !== "function") {
      finish();
      return undefined;
    }
    const exit = panel.animate([...panelKeyframes(reduced, sheet)].reverse(), { duration: GUIDE_EXIT_MS, easing: EASE_IN, fill: "forwards" });
    backdropRef.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: GUIDE_EXIT_MS, easing: EASE_IN, fill: "forwards" });
    let done = false;
    const once = () => {
      if (done) return;
      done = true;
      finish();
    };
    exit.onfinish = once;
    // Animations can be cancelled or never tick (background tab); never leave the dialog stuck.
    const fallback = window.setTimeout(once, GUIDE_EXIT_MS + 100);
    return () => window.clearTimeout(fallback);
  }, [open]);

  return (
    <dialog
      aria-labelledby={titleId}
      aria-modal="true"
      className="guide-modal fixed inset-0 m-0 border-0 h-dvh max-h-none w-full max-w-none bg-transparent p-0 text-[var(--ar-text)] backdrop:bg-transparent open:flex open:items-end open:justify-center sm:open:items-center sm:open:p-6"
      data-testid="guide-modal"
      onCancel={(event) => {
        event.preventDefault();
        onRequestClose();
      }}
      ref={dialogRef}
    >
      <div aria-hidden="true" className="absolute inset-0 bg-black/45 backdrop-blur-sm" data-testid="guide-modal-backdrop" onClick={onRequestClose} ref={backdropRef} />
      <div
        className="relative flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-sheets border border-[var(--ar-border)] bg-[var(--ar-surface)] shadow-2xl sm:max-h-[min(85dvh,52rem)] sm:max-w-[45rem] sm:rounded-sheets"
        ref={panelRef}
      >
        <div aria-hidden="true" className="flex justify-center pt-2 sm:hidden">
          <span className="h-1.5 w-10 rounded-full bg-[var(--ar-border-strong)]" />
        </div>
        <header className="flex items-center gap-3 border-b border-[var(--ar-border)] py-2 pr-2 pl-4 sm:pl-6">
          <Flag aria-hidden="true" className="size-5 shrink-0 text-[var(--ar-primary)]" />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-semibold" id={titleId}>
              {t("title")}
            </h2>
            <p className="hidden truncate text-sm text-[var(--ar-text-muted)] sm:block">{t("subtitle")}</p>
          </div>
          <button aria-label={t("actions.close")} className="flex size-12 shrink-0 items-center justify-center rounded-controls hover:bg-[var(--ar-surface-muted)]" data-testid="guide-modal-close" onClick={onRequestClose} type="button">
            <X aria-hidden="true" className="size-5" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-6" data-guide-scroll>
          {mounted || open ? <GuideFlow onLeave={onRequestClose} variant="modal" /> : null}
        </div>
        <footer className="flex justify-center border-t border-[var(--ar-border)] px-4 py-1 sm:justify-end sm:px-6">
          <button
            className="inline-flex min-h-12 items-center gap-2 rounded-controls px-3 text-sm font-semibold text-[var(--ar-link)] underline underline-offset-4 hover:bg-[var(--ar-surface-muted)]"
            data-testid="guide-modal-later"
            onClick={onRequestClose}
            type="button"
          >
            {t("actions.later")}
          </button>
        </footer>
      </div>
    </dialog>
  );
}
