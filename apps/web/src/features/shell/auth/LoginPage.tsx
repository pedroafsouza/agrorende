"use client";

import type { ErrorCode } from "@agrorende/contracts/errors";
import { LogIn } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { ErrorAlert } from "@/components/recovery/ErrorAlert";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { api, ApiError, isApiError } from "@/lib/api";

import { AuthCard } from "./AuthCard";
import { OAuthButtons, OrDivider } from "./OAuthButtons";
import { PasswordField } from "./PasswordField";

/** Only same-origin relative paths are accepted as the post-login destination. */
export function safeNext(raw: string | null): string {
  if (raw === null || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

export function LoginPage() {
  const t = useTranslations("auth");
  const admin = useTranslations("admin");
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(() => {
    const code = params.get("error");
    return code === null ? null : new ApiError({ code: code as ErrorCode, status: 400 });
  });

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api("/auth/login", { method: "POST", body: { email: email.trim().toLowerCase(), password } });
      router.replace(next);
      router.refresh();
    } catch (caught) {
      if (isApiError(caught, "PASSWORD_CHANGE_REQUIRED")) {
        router.replace(`/change-password?next=${encodeURIComponent(next)}`);
        return;
      }
      setError(caught);
      setPassword("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard brand={admin("shell.brand")} subtitle={t("login.subtitle")} title={t("login.title")}>
      <OAuthButtons />
      <OrDivider />
      <form
        className="flex flex-col gap-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {error === null ? null : <ErrorAlert error={error} />}
        <Field label={t("fields.email")} required>
          {(p) => <Input {...p} autoComplete="email" inputMode="email" name="email" onChange={(e) => setEmail(e.target.value)} type="email" value={email} />}
        </Field>
        <PasswordField autoComplete="current-password" label={t("fields.password")} name="password" onChange={setPassword} value={password} />
        <Button busy={busy} disabled={email.trim().length === 0 || password.length === 0} icon={<LogIn aria-hidden="true" className="size-5" />} size="primary" type="submit" variant="primary">
          {t("login.submit")}
        </Button>
      </form>
      <p className="text-sm text-[var(--ar-text-muted)]">{t("login.trouble")}</p>
      <p className="text-sm">
        {t("login.noAccount")}{" "}
        <Link className="inline-flex min-h-12 items-center font-semibold text-[var(--ar-link)]" href="/signup">
          {t("login.signup")}
        </Link>
      </p>
    </AuthCard>
  );
}
