"use client";

import type { ErrorCode } from "@agrorende/contracts/errors";
import { Apple, Building2, Smartphone, Users } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { ErrorAlert } from "@/components/recovery/ErrorAlert";
import { buttonVariants } from "@/components/ui/Button";
import { AuthCard } from "@/features/shell/auth/AuthCard";
import { ApiError, buildUrl } from "@/lib/api";

function GoogleMark() {
  return (
    <svg aria-hidden="true" className="size-5" viewBox="0 0 24 24">
      <path d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3z" fill="#4285F4" />
      <path d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22z" fill="#34A853" />
      <path d="M6.4 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.4H3.1a10 10 0 0 0 0 9.2L6.4 14z" fill="#FBBC05" />
      <path d="M12 6c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3.1 7.4L6.4 10C7.2 7.7 9.4 6 12 6z" fill="#EA4335" />
    </svg>
  );
}

/** `/signup`: company sign-up starts with Google or Apple only (TEN-01); the provider returns to `/signup/company?ticket=`. */
export function SignupStartPage() {
  const t = useTranslations("signup");
  const admin = useTranslations("admin");
  const params = useSearchParams();
  const code = params.get("error");
  const error = code === null ? null : new ApiError({ code: code as ErrorCode, status: 400 });
  const query = { intent: "signup" };
  const steps = [
    { icon: <Building2 aria-hidden="true" className="size-5 shrink-0 text-[var(--ar-primary-text)]" />, text: t("start.steps.company") },
    { icon: <Users aria-hidden="true" className="size-5 shrink-0 text-[var(--ar-primary-text)]" />, text: t("start.steps.team") },
    { icon: <Smartphone aria-hidden="true" className="size-5 shrink-0 text-[var(--ar-primary-text)]" />, text: t("start.steps.app") },
  ];
  return (
    <AuthCard brand={admin("shell.brand")} subtitle={t("start.subtitle")} title={t("start.title")}>
      {error === null ? null : <ErrorAlert error={error} />}
      <ol className="flex flex-col gap-3">
        {steps.map((step) => (
          <li className="flex items-start gap-3 text-sm" key={step.text}>
            {step.icon}
            <span>{step.text}</span>
          </li>
        ))}
      </ol>
      <div className="flex flex-col gap-2">
        <a className={buttonVariants({ variant: "secondary", size: "primary" })} href={buildUrl("/auth/oauth/google/start", query)}>
          <GoogleMark />
          {t("start.google")}
        </a>
        <a className={buttonVariants({ variant: "secondary", size: "primary" })} href={buildUrl("/auth/oauth/apple/start", query)}>
          <Apple aria-hidden="true" className="size-5" />
          {t("start.apple")}
        </a>
      </div>
      <p className="text-sm text-[var(--ar-text-muted)]">{t("start.trial")}</p>
      <p className="text-sm">
        {t("start.haveAccount")}{" "}
        <Link className="inline-flex min-h-12 items-center font-semibold text-[var(--ar-link)]" href="/login">
          {t("start.login")}
        </Link>
      </p>
    </AuthCard>
  );
}
