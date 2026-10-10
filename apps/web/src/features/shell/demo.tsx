"use client";

import { FlaskConical, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { cn } from "@/lib/cn";

/** Id of the demo organisation written by `packages/db/seed` (`uuid(1)` there). */
export const DEMO_ORG_ID = "018fd000-0000-7000-8000-000000000001";
export const DEMO_BANNER_DISMISSED_KEY = "agrorende.demoBanner.dismissed";

/**
 * There is no organisation flag for demo data, so the seeded organisation id marks the demo. A
 * deployment can force the indicator for every organisation with `NEXT_PUBLIC_DEMO_MODE=1`.
 */
export function isDemoOrg(orgId: string | null | undefined, demoMode: string | undefined = process.env.NEXT_PUBLIC_DEMO_MODE): boolean {
  if (demoMode === "1" || demoMode === "true") return true;
  return orgId === DEMO_ORG_ID;
}

/** Calm "Demonstração" pill that takes the tenant slot under the wordmark for the demo tenant. */
export function DemoPill({ className }: { readonly className?: string }) {
  const t = useTranslations("admin.shell.demo");
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border border-[var(--ar-warning)] bg-[var(--ar-warning-bg)] px-2 py-0.5 text-xs font-semibold text-[var(--ar-warning-text)]",
        className,
      )}
      data-testid="demo-pill"
      title={t("badgeLabel")}
    >
      <FlaskConical aria-hidden="true" className="size-3.5" />
      {t("badge")}
    </span>
  );
}

/** Thin banner under the top bar, dismissible for the browser session. */
export function DemoBanner() {
  const t = useTranslations("admin.shell.demo");
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      setDismissed(window.sessionStorage.getItem(DEMO_BANNER_DISMISSED_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  if (dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      window.sessionStorage.setItem(DEMO_BANNER_DISMISSED_KEY, "1");
    } catch {
      // Storage can be blocked; the banner then stays hidden until the next page load.
    }
  };

  return (
    <div
      className="flex items-center gap-2 border-b border-[var(--ar-warning)] bg-[var(--ar-warning-bg)] pl-4 pr-1 text-sm text-[var(--ar-warning-text)] lg:pl-6"
      data-testid="demo-banner"
      role="note"
    >
      <FlaskConical aria-hidden="true" className="size-4 shrink-0" />
      <p className="min-w-0 flex-1 py-1">{t("banner")}</p>
      <button
        aria-label={t("dismiss")}
        className="flex size-12 shrink-0 items-center justify-center rounded-controls hover:bg-[var(--ar-surface-muted)]"
        data-testid="demo-banner-dismiss"
        onClick={dismiss}
        type="button"
      >
        <X aria-hidden="true" className="size-4" />
      </button>
    </div>
  );
}
