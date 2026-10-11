import { BellOff } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { Switch } from "react-native";

import { useT } from "../../i18n";
import { getApiClient } from "../../lib/app/session";
import { Card, ErrorState, ListItem, Skeleton, showToast } from "../../ui";
import { useSyncSnapshot } from "../../ui/SyncBadge";

type PrefsState = { readonly status: "loading" } | { readonly status: "error"; readonly offline: boolean } | { readonly status: "ready"; readonly pushMuted: boolean };

/**
 * T05-008: the user's own push mute switch. Online-only: the value lives on the server
 * (`GET /auth/me`, `PATCH /me`), so offline this card shows an error state with retry.
 */
export function PushMuteCard() {
  const t = useT();
  const network = useSyncSnapshot().network;
  const offline = network === "offline" || network === "captivePortal" || network === "restricted";
  const [state, setState] = useState<PrefsState>({ status: "loading" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    if (offline) {
      setState({ status: "error", offline: true });
      return;
    }
    setState({ status: "loading" });
    try {
      const me = await getApiClient().me();
      setState({ status: "ready", pushMuted: me.user.notificationPrefs.pushMuted });
    } catch {
      setState({ status: "error", offline: false });
    }
  }, [offline]);

  useEffect(() => {
    void load();
  }, [load]);

  async function change(next: boolean): Promise<void> {
    if (state.status !== "ready") return;
    setSaving(true);
    setState({ status: "ready", pushMuted: next });
    try {
      await getApiClient().updateMe({ notificationPrefs: { pushMuted: next } });
      showToast({ messageKey: next ? "settings.push.muted" : "settings.push.unmuted", tone: "success" });
    } catch {
      setState({ status: "ready", pushMuted: !next });
      showToast({ messageKey: "settings.push.saveFailed", tone: "danger" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      {state.status === "loading" ? (
        <Skeleton lines={2} />
      ) : state.status === "error" ? (
        <>
          <ListItem icon={BellOff} titleKey="settings.push.title" />
          <ErrorState titleKey={state.offline ? "settings.push.offlineTitle" : "ui.error.title"} bodyKey={state.offline ? "settings.push.offlineBody" : "ui.error.body"} onRetry={() => void load()} />
        </>
      ) : (
        <ListItem
          icon={BellOff}
          titleKey="settings.push.title"
          subtitleKey="settings.push.body"
          right={<Switch testID="settings-push-muted" accessibilityLabel={t("settings.push.title")} disabled={saving || offline} value={state.pushMuted} onValueChange={(next) => void change(next)} />}
        />
      )}
    </Card>
  );
}
