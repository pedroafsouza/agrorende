"use client";

import { RefreshCw, WifiOff } from "lucide-react";
import { useTranslations } from "next-intl";

export type RealtimeStatusState = "connecting" | "connected" | "reconnecting" | "offline";

/** Live-updates indicator: the data on screen stays usable; it just stops refreshing itself (REC-14). */
export function RealtimeStatus({ state }: { readonly state: RealtimeStatusState }) {
  const t = useTranslations("common");
  // Healthy connections stay silent; the badge only appears when updates have stopped (SIMPLER-TO-SELL §4).
  if (state === "connected" || state === "connecting") return null;
  const Icon = state === "offline" ? WifiOff : RefreshCw;
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-[var(--ar-warning)] bg-[var(--ar-warning-bg)] px-2 py-1 text-xs font-semibold text-[var(--ar-warning-text)]" role="status">
      <Icon aria-hidden="true" className="size-4" />
      {t(`realtime.${state}`)}
    </span>
  );
}
