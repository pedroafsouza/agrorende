"use client";

import type { ErrorCode } from "@agrorende/contracts/errors";
import { FlaskConical, ShieldCheck } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { ErrorAlert } from "@/components/recovery/ErrorAlert";
import { Button, buttonVariants } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { AuthCard } from "@/features/shell/auth/AuthCard";
import { ApiError, buildUrl } from "@/lib/api";

/** `/platform/login`: staff sign in with Google only (TEN-06). Locally a mock e-mail field passes `login_hint`. */
export function PlatformLoginPage({ showDevLogin }: { readonly showDevLogin: boolean }) {
  const t = useTranslations("platform");
  const code = useSearchParams().get("error");
  const error = code === null ? null : new ApiError({ code: code as ErrorCode, status: 400 });
  const [hint, setHint] = useState("");
  return (
    <AuthCard brand={t("brand")} subtitle={t("login.subtitle")} title={t("login.title")}>
      {error === null ? null : <ErrorAlert error={error} />}
      <a className={buttonVariants({ variant: "primary", size: "primary" })} href={buildUrl("/platform/auth/google/start")}>
        <ShieldCheck aria-hidden="true" className="size-5" />
        {t("login.google")}
      </a>
      <p className="text-sm text-[var(--ar-text-muted)]">{t("login.allowList")}</p>
      {showDevLogin ? (
        <form action={buildUrl("/platform/auth/google/start")} className="flex flex-col gap-3 rounded-cards border border-dashed border-[var(--ar-border-strong)] p-4" method="get">
          <Field hint={t("login.devHint")} label={t("login.devLabel")}>
            {(p) => <Input {...p} autoComplete="email" inputMode="email" name="login_hint" onChange={(e) => setHint(e.target.value)} type="email" value={hint} />}
          </Field>
          <Button disabled={hint.trim().length === 0} icon={<FlaskConical aria-hidden="true" className="size-5" />} type="submit">
            {t("login.devSubmit")}
          </Button>
        </form>
      ) : null}
    </AuthCard>
  );
}
