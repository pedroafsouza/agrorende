"use client";

import { useQuery } from "@tanstack/react-query";
import { KeyRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { LoadingState } from "@/components/data/States";
import { ErrorAlert } from "@/components/recovery/ErrorAlert";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { api } from "@/lib/api";
import { useFieldErrors } from "@/lib/forms";

import { AuthCard } from "./AuthCard";
import { OAuthButtons, OrDivider } from "./OAuthButtons";
import { MIN_PASSWORD, PasswordField } from "./PasswordField";

/** Shape returned by `GET /auth/invites/:code` (T02). Fields are optional so a thinner payload still renders. */
export interface InviteLookup {
  readonly organizationName?: string;
  readonly name?: string | null;
  readonly email?: string | null;
  readonly role?: "ADMIN" | "MANAGER" | "FIELD";
  readonly expiresAt?: string;
}

export function InvitePage({ code }: { readonly code: string }) {
  const t = useTranslations("auth");
  const admin = useTranslations("admin");
  const router = useRouter();
  const lookup = useQuery({ queryKey: ["invite", code], queryFn: () => api<InviteLookup>(`/auth/invites/${encodeURIComponent(code)}`), retry: false });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const fe = useFieldErrors()(error);

  if (lookup.isLoading) {
    return (
      <AuthCard brand={admin("shell.brand")} title={t("invite.title")}>
        <LoadingState />
      </AuthCard>
    );
  }
  if (lookup.error !== null || lookup.data === undefined) {
    return (
      <AuthCard brand={admin("shell.brand")} title={t("invite.title")}>
        <ErrorAlert error={lookup.error} onRetry={() => void lookup.refetch()} />
        <p className="text-[var(--ar-text-muted)]">{t("invite.askAdmin")}</p>
      </AuthCard>
    );
  }
  const invite = lookup.data;
  const needsEmail = invite.email === null || invite.email === undefined || invite.email.length === 0;
  const tooShort = password.length > 0 && password.length < MIN_PASSWORD;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(`/auth/invites/${encodeURIComponent(code)}/password`, { method: "POST", body: { password, ...(needsEmail && email.length > 0 ? { email: email.trim().toLowerCase() } : {}) } });
      router.replace(invite.role === "FIELD" ? "/office-role-required" : "/");
      router.refresh();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard
      brand={admin("shell.brand")}
      subtitle={t("invite.subtitle", { org: invite.organizationName ?? "", role: invite.role === undefined ? "" : admin(`roles.${invite.role}`) })}
      title={invite.name === null || invite.name === undefined ? t("invite.title") : t("invite.greeting", { name: invite.name })}
    >
      {invite.role === "FIELD" ? <p className="rounded-cards bg-[var(--ar-info-bg)] p-3 text-[var(--ar-info-text)]">{t("invite.fieldHint")}</p> : null}
      <OAuthButtons intent="invite" inviteCode={code} />
      <OrDivider />
      <form
        className="flex flex-col gap-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (!tooShort && password.length > 0) void submit();
        }}
      >
        {error === null ? null : <ErrorAlert error={error} />}
        {needsEmail ? (
          <Field error={fe.email} hint={t("invite.emailHint")} label={t("fields.email")}>
            {(p) => <Input {...p} autoComplete="email" inputMode="email" onChange={(e) => setEmail(e.target.value)} type="email" value={email} />}
          </Field>
        ) : (
          <p>
            {t("invite.signInAs")} <strong>{invite.email}</strong>
          </p>
        )}
        <PasswordField autoComplete="new-password" error={fe.password ?? (tooShort ? t("password.tooShort", { min: MIN_PASSWORD }) : undefined)} hint={t("password.rule", { min: MIN_PASSWORD })} label={t("fields.newPassword")} name="password" onChange={setPassword} value={password} />
        <Button busy={busy} disabled={password.length === 0 || tooShort} icon={<KeyRound aria-hidden="true" className="size-5" />} size="primary" type="submit" variant="primary">
          {t("invite.submit")}
        </Button>
      </form>
    </AuthCard>
  );
}
