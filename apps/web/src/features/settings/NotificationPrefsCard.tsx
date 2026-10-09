"use client";

import type { NotificationPrefs } from "@agrorende/contracts/dto";
import { notificationPrefsOf } from "@agrorende/contracts/dto";
import { useQuery } from "@tanstack/react-query";
import { BellOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Card } from "@/components/data/Detail";
import { LoadingState } from "@/components/data/States";
import { ErrorAlert } from "@/components/recovery/ErrorAlert";
import { Checkbox } from "@/components/ui/Field";
import { api } from "@/lib/api";
import { useSave } from "@/lib/useSave";

interface MeWithPrefs {
  readonly user: { readonly notificationPrefs?: unknown };
}

/** T05-008: the signed-in user's own push mute switch (PATCH /me). In-app notifications are never muted. */
export function NotificationPrefsCard() {
  const t = useTranslations("settings");
  const common = useTranslations("common");
  const query = useQuery({ queryKey: ["me"], queryFn: () => api<MeWithPrefs>("/auth/me"), staleTime: 5 * 60_000 });
  const [save, state] = useSave("me", (prefs: Partial<NotificationPrefs>) => api("/me", { method: "PATCH", body: { notificationPrefs: prefs } }), () => toast.success(common("toast.saved")));

  return (
    <Card title={t("notifications.title")}>
      {query.isLoading ? (
        <LoadingState rows={1} />
      ) : query.error !== null || query.data === undefined ? (
        <ErrorAlert error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex items-start gap-3">
            <BellOff aria-hidden="true" className="mt-3.5 size-5 shrink-0 text-[var(--ar-text-muted)]" />
            <Checkbox
              checked={notificationPrefsOf(query.data.user.notificationPrefs).pushMuted}
              disabled={state.busy}
              label={t("notifications.pushMuted")}
              onChange={(e) => void save({ pushMuted: e.target.checked })}
            />
          </div>
          <p className="text-sm text-[var(--ar-text-muted)]">{t("notifications.pushMutedHint")}</p>
          {state.error === null ? null : <ErrorAlert compact error={state.error} />}
        </div>
      )}
    </Card>
  );
}
