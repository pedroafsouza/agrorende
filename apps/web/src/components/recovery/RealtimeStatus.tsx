"use client";

import { RefreshCw, Wifi, WifiOff } from "lucide-react";
import { useTranslations } from "next-intl";

export type RealtimeStatusState = "connecting" | "connected" | "reconnecting" | "offline";

/** Live-updates indicator: the data on screen stays usable; it just stops refreshing itself (REC-14). */
export function RealtimeStatus({ state }: { readonly state: RealtimeStatusState }) {
  const t = useTranslations("common");
  if (state === "connected" || state === "connecting") {
    return (
      <span className="hidden items-center gap-1 text-xs text-[var(--ar-text-muted)] lg:inline-flex" title={t(`realtime.${state}`)}>
        <Wifi aria-hidden="true" className="size-4" />
        <span className="sr-only">{t(`realtime.${state}`)}</span>
      </span>
    );
  }
  const Icon = state === "offline" ? WifiOff : RefreshCw;
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-[var(--ar-warning)] bg-[var(--ar-warning-bg)] px-2 py-1 text-xs font-semibold text-[var(--ar-warning-text)]" role="status">
      <Icon aria-hidden="true" className="size-4" />
      {t(`realtime.${state}`)}
    </span>
  );
}
