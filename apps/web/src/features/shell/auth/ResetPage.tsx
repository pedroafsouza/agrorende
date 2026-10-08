"use client";

import { useQuery } from "@tanstack/react-query";
import { KeyRound } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { LoadingState } from "@/components/data/States";
import { ErrorAlert } from "@/components/recovery/ErrorAlert";
import { Button, buttonVariants } from "@/components/ui/Button";
import { api } from "@/lib/api";
import { useFieldErrors } from "@/lib/forms";

import { AuthCard } from "./AuthCard";
import { MIN_PASSWORD, PasswordField } from "./PasswordField";

export function ResetPage({ code }: { readonly code: string }) {
  const t = useTranslations("auth");
  const admin = useTranslations("admin");
  const lookup = useQuery({ queryKey: ["reset", code], queryFn: () => api<{ email?: string | null }>(`/auth/reset/${encodeURIComponent(code)}`), retry: false });
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const fe = useFieldErrors()(error);
  const tooShort = password.length > 0 && password.length < MIN_PASSWORD;
  const mismatch = confirm.length > 0 && confirm !== password;

  if (lookup.isLoading) {
    return (
      <AuthCard brand={admin("shell.brand")} title={t("reset.title")}>
        <LoadingState />
      </AuthCard>
    );
  }
  if (lookup.error !== null) {
    return (
      <AuthCard brand={admin("shell.brand")} title={t("reset.title")}>
        <ErrorAlert error={lookup.error} onRetry={() => void lookup.refetch()} />
        <p className="text-[var(--ar-text-muted)]">{t("reset.askAdmin")}</p>
      </AuthCard>
    );
  }
  if (done) {
    return (
      <AuthCard brand={admin("shell.brand")} subtitle={t("reset.doneBody")} title={t("reset.doneTitle")}>
        <Link className={buttonVariants({ variant: "primary", size: "primary" })} href="/login">
          {t("login.submit")}
        </Link>
      </AuthCard>
    );
  }

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(`/auth/reset/${encodeURIComponent(code)}`, { method: "POST", body: { password } });
      setDone(true);
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard brand={admin("shell.brand")} subtitle={lookup.data?.email ?? undefined} title={t("reset.title")}>
      <form
        className="flex flex-col gap-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (!tooShort && !mismatch && password.length > 0) void submit();
        }}
      >
        {error === null ? null : <ErrorAlert error={error} />}
        <PasswordField autoComplete="new-password" error={fe.password ?? (tooShort ? t("password.tooShort", { min: MIN_PASSWORD }) : undefined)} hint={t("password.rule", { min: MIN_PASSWORD })} label={t("fields.newPassword")} name="password" onChange={setPassword} value={password} />
        <PasswordField autoComplete="new-password" error={mismatch ? t("password.mismatch") : undefined} label={t("fields.confirmPassword")} name="confirm" onChange={setConfirm} value={confirm} />
        <Button busy={busy} disabled={password.length === 0 || tooShort || mismatch} icon={<KeyRound aria-hidden="true" className="size-5" />} size="primary" type="submit" variant="primary">
          {t("reset.submit")}
        </Button>
      </form>
    </AuthCard>
  );
}
