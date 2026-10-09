import { SUPPORTED_LOCALES } from "@agrorende/i18n";
import { useRouter } from "expo-router";
import { CircleHelp, Download, Languages, LogOut, Navigation, Palette, RefreshCw, Send, Trash2, Wifi } from "lucide-react-native";
import { useState } from "react";
import { Platform, Switch, View } from "react-native";

import { authStore } from "../../auth/session";
import { setLocale, useLocale, useT, type AppLocale } from "../../i18n";
import { getApiClient } from "../../lib/app/session";
import { saveDevicePrefs } from "../../lib/app/prefs";
import { NAVIGATION_APPS, type NavigationApp } from "../../lib/navigation";
import { useServices } from "../../lib/services";
import { bumpLocalData, useLocalQuery } from "../../lib/useLocalQuery";
import { BottomSheet, Button, Card, ConfirmDialog, ListItem, Screen, Segmented, Skeleton, Text, TextField, setThemePreference, showToast, useThemePreference, type ThemePreference } from "../../ui";
import { AskOfficeButton } from "../../ui/recovery";
import { savePendingWorkCopy, sendEverythingNow } from "../sync/pendingWork";
import { deleteAccount, signOutHere } from "./account";
import { PushMuteCard } from "./PushMuteCard";
import { deleteConfirmationMatches, loadUserSettings, pendingItemCount, saveNavApp, saveWifiOnlyVideo } from "./logic";

const THEMES: readonly ThemePreference[] = ["system", "light", "dark", "outdoor"];

/** Settings (§13.1): language, theme, navigation app, Wi-Fi-only video, help and account. */
export function SettingsScreen() {
  const router = useRouter();
  const services = useServices();
  const locale = useLocale();
  const t = useT();
  const theme = useThemePreference();
  const query = useLocalQuery(async (db) => ({ ...(await loadUserSettings(db)), pending: await pendingItemCount(db) }));
  const [logoutGuard, setLogoutGuard] = useState(false);
  const [deleteGuard, setDeleteGuard] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | undefined>(undefined);
  const [sendingNow, setSendingNow] = useState(false);
  const [savingCopy, setSavingCopy] = useState(false);
  const platform = Platform.OS === "ios" ? "ios" : "android";

  function changeLocale(next: AppLocale): void {
    setLocale(next);
    void saveDevicePrefs({ locale: next });
    if (next === "pt-BR" || next === "en") getApiClient().updateMe({ locale: next }).catch(() => undefined);
  }

  async function signOut(): Promise<void> {
    setBusy(true);
    try {
      await signOutHere();
      router.replace("/login");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete(): Promise<void> {
    setBusy(true);
    setDeleteError(undefined);
    try {
      await deleteAccount(typed.trim());
      router.replace("/login");
    } catch (error) {
      const code = (error as { code?: unknown }).code;
      setDeleteError(typeof code === "string" ? code : "NETWORK_OFFLINE");
    } finally {
      setBusy(false);
    }
  }

  const pending = query.status === "ready" ? query.data.pending : 0;
  const user = authStore.getState().user;

  async function sendNow(): Promise<void> {
    setSendingNow(true);
    showToast({ messageKey: "settings.account.sending" });
    try {
      await sendEverythingNow(services);
    } catch (_error) {
      // The sync cycle reports its own errors in Sync Center; nothing is lost here.
    } finally {
      setSendingNow(false);
    }
  }

  async function saveCopy(): Promise<void> {
    const userId = services.userId ?? user?.id;
    if (services.db === undefined || userId === undefined) return;
    setSavingCopy(true);
    try {
      await savePendingWorkCopy(services.db, userId);
    } catch (_error) {
      showToast({ messageKey: "sync.copy.failed", tone: "danger" });
    } finally {
      setSavingCopy(false);
    }
  }

  return (
    <Screen testID="settings">
      <Card>
        <ListItem icon={Languages} titleKey="settings.language.title" subtitleKey="settings.language.body" />
        <Segmented<AppLocale>
          testID="settings-language"
          value={locale}
          onChange={changeLocale}
          options={SUPPORTED_LOCALES.map((value) => ({ value, labelKey: `settings.language.${value}` }))}
        />
      </Card>
      <Card>
        <ListItem icon={Palette} titleKey="settings.theme.title" />
        <Segmented<ThemePreference>
          testID="settings-theme"
          value={theme}
          onChange={(next) => {
            setThemePreference(next);
            void saveDevicePrefs({ theme: next });
          }}
          options={THEMES.map((value) => ({ value, labelKey: `settings.theme.${value}` }))}
        />
      </Card>
      {query.status !== "ready" ? (
        <Skeleton lines={3} />
      ) : (
        <>
          <Card>
            <ListItem icon={Navigation} titleKey="settings.nav.title" subtitleKey="settings.nav.body" />
            <Segmented<NavigationApp>
              testID="settings-nav"
              value={query.data.navApp ?? (NAVIGATION_APPS[platform][0] as NavigationApp)}
              onChange={(next) => {
                if (services.db === undefined) return;
                void saveNavApp(services.db, next).then(bumpLocalData);
              }}
              options={NAVIGATION_APPS[platform].map((value) => ({ value, labelKey: `settings.nav.${value}` }))}
            />
          </Card>
          <Card>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View style={{ flex: 1 }}>
                <ListItem icon={Wifi} titleKey="settings.wifiVideo.title" subtitleKey="settings.wifiVideo.body" />
              </View>
              <Switch
                testID="settings-wifi-video"
                accessibilityLabel={t("settings.wifiVideo.title")}
                value={query.data.wifiOnlyVideo}
                onValueChange={(next) => {
                  if (services.db === undefined) return;
                  void saveWifiOnlyVideo(services.db, next).then(bumpLocalData);
                }}
              />
            </View>
          </Card>
        </>
      )}
      <PushMuteCard />
      <Card>
        <ListItem icon={RefreshCw} titleKey="settings.help.syncCenter" subtitleKey="settings.help.syncCenterBody" onPress={() => router.push("/sync-center")} testID="settings-sync-center" />
        <ListItem icon={CircleHelp} titleKey="settings.help.title" subtitleKey="settings.help.body" />
        <AskOfficeButton code="OFFICE_CONTACT_MISSING" />
      </Card>
      <Card>
        <Text i18nKey="settings.account.title" variant="heading" />
        {user === undefined ? null : <Text tone="secondary">{user.name}</Text>}
        <Text testID="settings-pending" i18nKey="settings.account.pending" values={{ count: pending }} tone="secondary" />
        {pending > 0 ? (
          <>
            <Text i18nKey="settings.account.sendNowHint" tone="secondary" variant="caption" />
            <Button testID="settings-send-now" labelKey="sync.action.sendNow" icon={Send} loading={sendingNow} onPress={() => void sendNow()} />
            <Button testID="settings-save-copy" labelKey="sync.action.saveCopy" icon={Download} variant="secondary" loading={savingCopy} onPress={() => void saveCopy()} />
          </>
        ) : null}
        <Button testID="settings-logout" labelKey="settings.account.logout" icon={LogOut} variant="secondary" loading={busy} onPress={() => (pending > 0 ? setLogoutGuard(true) : void signOut())} />
        <Button testID="settings-delete" labelKey="settings.account.delete" icon={Trash2} variant="ghost" onPress={() => (pending > 0 ? setDeleteGuard(true) : setDeleteOpen(true))} />
      </Card>
      <ConfirmDialog
        visible={logoutGuard}
        titleKey="errors.LOGOUT_PENDING_DATA.title"
        bodyKey="errors.LOGOUT_PENDING_DATA.body"
        confirmLabelKey="settings.account.logoutAnyway"
        cancelLabelKey="errors.LOGOUT_PENDING_DATA.action"
        onConfirm={() => {
          setLogoutGuard(false);
          void signOut();
        }}
        onCancel={() => setLogoutGuard(false)}
      />
      <ConfirmDialog
        visible={deleteGuard}
        titleKey="errors.ACCOUNT_DELETE_PENDING_DATA.title"
        bodyKey="errors.ACCOUNT_DELETE_PENDING_DATA.body"
        confirmLabelKey="errors.ACCOUNT_DELETE_PENDING_DATA.action"
        onConfirm={() => {
          setDeleteGuard(false);
          void sendEverythingNow(services).catch(() => undefined);
          showToast({ messageKey: "settings.account.sending" });
          router.push("/sync-center");
        }}
        onCancel={() => setDeleteGuard(false)}
      />
      <BottomSheet visible={deleteOpen} onClose={() => setDeleteOpen(false)} titleKey="settings.account.deleteTitle" testID="settings-delete-sheet">
        <Text i18nKey="settings.account.deleteBody" />
        <TextField testID="settings-delete-input" labelKey="settings.account.deleteTypeLabel" hintKey="settings.account.deleteTypeHint" value={typed} onChangeText={setTyped} autoCapitalize="characters" />
        {deleteError === undefined ? null : <Text i18nKey={`errors.${deleteError}.title`} tone="danger" />}
        <Button
          testID="settings-delete-confirm"
          labelKey="settings.account.deleteConfirm"
          variant="danger"
          loading={busy}
          disabled={!deleteConfirmationMatches(typed, t("settings.account.deletePhrase"))}
          onPress={() => void confirmDelete()}
        />
      </BottomSheet>
    </Screen>
  );
}
