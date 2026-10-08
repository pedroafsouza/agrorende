import { useRouter } from "expo-router";
import { Apple, KeyRound, LifeBuoy, LogIn, Ticket } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";

import type { AppErrorCode } from "@agrorende/contracts/errors";

import { isAppleSignInAvailable, signInWithApple, signInWithGoogle } from "../oauth";
import { appConfig } from "../../lib/app/config";
import { loadDevicePrefs } from "../../lib/app/prefs";
import { getApiClient, getDeviceId, platform } from "../../lib/app/session";
import { BottomSheet, Button, Card, Screen, Text, TextField } from "../../ui";
import { AskOfficeButton, ErrorBanner } from "../../ui/recovery";
import { space } from "../../ui/theme";
import { finishLogin, loginErrorCode } from "./flow";

/** Sign-in (PLT-01): Google and Apple with equal weight, email + password, invite code, trouble help. */
export function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<"password" | "google" | "apple" | "invite" | undefined>(undefined);
  const [error, setError] = useState<AppErrorCode | undefined>(undefined);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [troubleOpen, setTroubleOpen] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [invitePassword, setInvitePassword] = useState("");

  useEffect(() => {
    if (Platform.OS === "ios") void isAppleSignInAvailable().then(setAppleAvailable);
  }, []);

  async function done(): Promise<void> {
    const prefs = await loadDevicePrefs();
    router.replace(prefs.onboarded === true ? "/today" : "/onboarding");
  }

  async function run(kind: NonNullable<typeof busy>, action: () => Promise<Parameters<typeof finishLogin>[0]>): Promise<void> {
    setBusy(kind);
    setError(undefined);
    try {
      await finishLogin(await action());
      await done();
    } catch (failure) {
      const code = loginErrorCode(failure);
      if (code === "PASSWORD_CHANGE_REQUIRED") router.push("/change-password");
      else if (code !== "OAUTH_CANCELLED") setError(code);
    } finally {
      setBusy(undefined);
    }
  }

  const oauthContext = () => ({ api: getApiClient(), deviceId: getDeviceId(), platform, redirectUri: `${appConfig.scheme}://oauth` });

  return (
    <Screen testID="login">
      <View style={styles.hero}>
        <Text i18nKey="auth.login.title" variant="display" />
        <Text i18nKey="auth.login.subtitle" tone="secondary" />
      </View>
      {error === undefined ? null : <ErrorBanner code={error} onDismiss={() => setError(undefined)} />}
      <Card>
        <Button testID="login-google" labelKey="auth.login.google" icon={LogIn} variant="secondary" loading={busy === "google"} onPress={() => void run("google", () => signInWithGoogle(oauthContext()))} />
        {appleAvailable ? <Button testID="login-apple" labelKey="auth.login.apple" icon={Apple} variant="secondary" loading={busy === "apple"} onPress={() => void run("apple", () => signInWithApple(oauthContext()))} /> : null}
      </Card>
      <Text i18nKey="auth.login.or" tone="secondary" style={styles.center} />
      <Card>
        <TextField testID="login-email" labelKey="auth.login.email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="username" />
        <TextField testID="login-password" labelKey="auth.login.password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" textContentType="password" />
        <Button
          testID="login-submit"
          labelKey="auth.login.submit"
          icon={KeyRound}
          loading={busy === "password"}
          disabled={email.trim().length === 0 || password.length === 0}
          onPress={() => void run("password", () => getApiClient().login({ email: email.trim(), password, deviceId: getDeviceId(), platform }))}
        />
      </Card>
      <Button testID="login-invite" labelKey="auth.login.haveInvite" icon={Ticket} variant="ghost" onPress={() => setInviteOpen(true)} />
      <Button testID="login-trouble" labelKey="auth.login.trouble" icon={LifeBuoy} variant="ghost" onPress={() => setTroubleOpen(true)} />

      <BottomSheet visible={inviteOpen} onClose={() => setInviteOpen(false)} titleKey="auth.invite.title" testID="login-invite-sheet">
        <Text i18nKey="auth.invite.body" tone="secondary" />
        <TextField testID="invite-code" labelKey="auth.invite.code" value={inviteCode} onChangeText={setInviteCode} autoCapitalize="characters" />
        <TextField testID="invite-password" labelKey="auth.invite.password" hintKey="auth.invite.passwordHint" value={invitePassword} onChangeText={setInvitePassword} secureTextEntry />
        <Button
          testID="invite-submit"
          labelKey="auth.invite.submit"
          loading={busy === "invite"}
          disabled={inviteCode.trim().length === 0 || invitePassword.length < 8}
          onPress={() => {
            setInviteOpen(false);
            void run("invite", () => getApiClient().redeemInvitePassword(inviteCode.trim(), { password: invitePassword, deviceId: getDeviceId(), platform }));
          }}
        />
        <Button
          labelKey="auth.invite.withGoogle"
          variant="secondary"
          disabled={inviteCode.trim().length === 0}
          onPress={() => {
            setInviteOpen(false);
            void run("google", () => signInWithGoogle({ ...oauthContext(), intent: "invite", inviteCode: inviteCode.trim() }));
          }}
        />
      </BottomSheet>
      <BottomSheet visible={troubleOpen} onClose={() => setTroubleOpen(false)} titleKey="auth.trouble.title" testID="login-trouble-sheet">
        <Text i18nKey="auth.trouble.forgot" />
        <Text i18nKey="auth.trouble.disabled" tone="secondary" />
        <Text i18nKey="auth.trouble.offline" tone="secondary" />
        <AskOfficeButton code={error ?? "INVALID_CREDENTIALS"} />
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { gap: space[2], paddingVertical: space[6] },
  center: { textAlign: "center" },
});
