"use client";

import { KeyRound } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { ErrorAlert } from "@/components/recovery/ErrorAlert";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api";
import { useFieldErrors } from "@/lib/forms";

import { AuthCard } from "./AuthCard";
import { safeNext } from "./LoginPage";
import { MIN_PASSWORD, PasswordField } from "./PasswordField";

/** Forced after a temporary password (`mustChangePassword`) and reachable from the account page. */
export function ChangePasswordPage() {
  const t = useTranslations("auth");
  const admin = useTranslations("admin");
  const router = useRouter();
  const params = useSearchParams();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const fe = useFieldErrors()(error);
  const tooShort = next.length > 0 && next.length < MIN_PASSWORD;
  const mismatch = confirm.length > 0 && confirm !== next;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api("/auth/change-password", { method: "POST", body: { ...(current.length > 0 ? { current } : {}), next } });
      router.replace(safeNext(params.get("next")));
      router.refresh();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard brand={admin("shell.brand")} subtitle={t("changePassword.subtitle")} title={t("changePassword.title")}>
      <form
        className="flex flex-col gap-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (!tooShort && !mismatch && next.length > 0) void submit();
        }}
      >
        {error === null ? null : <ErrorAlert error={error} />}
        <PasswordField autoComplete="current-password" error={fe.current} hint={t("changePassword.currentHint")} label={t("fields.currentPassword")} name="current" onChange={setCurrent} value={current} />
        <PasswordField autoComplete="new-password" error={fe.next ?? (tooShort ? t("password.tooShort", { min: MIN_PASSWORD }) : undefined)} hint={t("password.rule", { min: MIN_PASSWORD })} label={t("fields.newPassword")} name="next" onChange={setNext} value={next} />
        <PasswordField autoComplete="new-password" error={mismatch ? t("password.mismatch") : undefined} label={t("fields.confirmPassword")} name="confirm" onChange={setConfirm} value={confirm} />
        <Button busy={busy} disabled={next.length === 0 || tooShort || mismatch} icon={<KeyRound aria-hidden="true" className="size-5" />} size="primary" type="submit" variant="primary">
          {t("changePassword.submit")}
        </Button>
      </form>
    </AuthCard>
  );
}
