import { useRouter } from "expo-router";
import { KeyRound } from "lucide-react-native";
import { useState } from "react";

import type { AppErrorCode } from "@agrorende/contracts/errors";

import { errorCodeOf } from "../../lib/errors";
import { getApiClient } from "../../lib/app/session";
import { Button, Card, Screen, Text, TextField } from "../../ui";
import { ErrorBanner } from "../../ui/recovery";

import { newPasswordProblem } from "./rules";

/** Forced or voluntary password change (EC-PLT-04 `PASSWORD_CHANGE_REQUIRED`). */
export function ChangePasswordScreen() {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AppErrorCode | undefined>(undefined);
  const problem = newPasswordProblem(next, confirm);

  async function submit(): Promise<void> {
    setBusy(true);
    setError(undefined);
    try {
      await getApiClient().changePassword({ ...(current.length > 0 ? { current } : {}), next });
      router.replace("/today");
    } catch (failure) {
      setError(errorCodeOf(failure, "INTERNAL"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen testID="change-password" footer={<Button testID="change-password-submit" labelKey="auth.changePassword.submit" icon={KeyRound} loading={busy} disabled={problem !== undefined} onPress={() => void submit()} />}>
      <Text i18nKey="auth.changePassword.body" tone="secondary" />
      {error === undefined ? null : <ErrorBanner code={error} onDismiss={() => setError(undefined)} />}
      <Card>
        <TextField testID="change-password-current" labelKey="auth.changePassword.current" value={current} onChangeText={setCurrent} secureTextEntry />
        <TextField testID="change-password-next" labelKey="auth.changePassword.next" hintKey="auth.changePassword.hint" value={next} onChangeText={setNext} secureTextEntry />
        <TextField testID="change-password-confirm" labelKey="auth.changePassword.confirm" value={confirm} onChangeText={setConfirm} secureTextEntry errorKey={confirm.length > 0 ? problem : undefined} />
      </Card>
    </Screen>
  );
}
