"use client";

import { Building2, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { ErrorAlert } from "@/components/recovery/ErrorAlert";
import { Button, buttonVariants } from "@/components/ui/Button";
import { Checkbox, Field, Input, Select } from "@/components/ui/Field";
import { AuthCard } from "@/features/shell/auth/AuthCard";
import { api, ApiError, isApiError } from "@/lib/api";

import {
  BRAZIL_STATES,
  BRAZIL_TIMEZONES,
  defaultTimezone,
  EXPECTED_FIELD_USERS,
  safeRedirect,
  signupBody,
  signupFieldErrorKey,
  type CompanyFormValues,
} from "./helpers";

interface SignupResponse {
  readonly redirectTo: string | null;
}

/** `/signup/company`: the company form after Google or Apple (TEN-01). The ticket comes from the OAuth callback. */
export function CompanyFormPage({ termsUrl, privacyUrl, dpaUrl, navigate }: { readonly termsUrl: string; readonly privacyUrl: string; readonly dpaUrl: string; readonly navigate?: (url: string) => void }) {
  const t = useTranslations("signup");
  const admin = useTranslations("admin");
  const uiLocale = useLocale();
  const ticket = useSearchParams().get("ticket") ?? "";
  const initialZone = useMemo(() => defaultTimezone(typeof Intl === "undefined" ? undefined : Intl.DateTimeFormat().resolvedOptions().timeZone), []);
  const [values, setValues] = useState<CompanyFormValues>({
    name: "",
    officePhone: "",
    taxId: "",
    city: "",
    state: "",
    timezone: initialZone,
    locale: uiLocale === "en" ? "en" : "pt-BR",
    expectedFieldUsers: "1-5",
    acceptTerms: false,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const set = <K extends keyof CompanyFormValues>(key: K, value: CompanyFormValues[K]) => setValues((current) => ({ ...current, [key]: value }));

  const fieldErrors: Record<string, string> = {};
  if (error instanceof ApiError) {
    for (const fe of error.fieldErrors) fieldErrors[fe.path] ??= t(`fieldErrors.${signupFieldErrorKey(fe.path, fe.code)}`);
  }
  const ticketExpired = isApiError(error, "OAUTH_STATE_EXPIRED");

  if (ticket.length === 0) {
    return (
      <AuthCard brand={admin("shell.brand")} subtitle={t("company.noTicket")} title={t("company.title")}>
        <Link className={buttonVariants({ variant: "primary", size: "primary" })} href="/signup">
          <RotateCcw aria-hidden="true" className="size-5" />
          {t("company.restart")}
        </Link>
      </AuthCard>
    );
  }

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await api<SignupResponse>("/signup/organization", { method: "POST", body: signupBody(ticket, values), skipAuthRetry: true });
      (navigate ?? ((url: string) => window.location.assign(url)))(safeRedirect(result.redirectTo));
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard brand={admin("shell.brand")} subtitle={t("company.subtitle")} title={t("company.title")}>
      <form
        className="flex flex-col gap-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {error === null || (error instanceof ApiError && error.code === "VALIDATION_FAILED") ? null : (
          <ErrorAlert
            action={
              ticketExpired ? (
                <Link className={buttonVariants({ variant: "secondary" })} href="/signup">
                  <RotateCcw aria-hidden="true" className="size-5" />
                  {t("company.restart")}
                </Link>
              ) : undefined
            }
            error={error}
          />
        )}
        <Field error={fieldErrors.name} label={t("company.fields.name")} required>
          {(p) => <Input {...p} autoComplete="organization" maxLength={120} name="name" onChange={(e) => set("name", e.target.value)} value={values.name} />}
        </Field>
        <Field error={fieldErrors.officePhone} hint={t("company.hints.officePhone")} label={t("company.fields.officePhone")} required>
          {(p) => <Input {...p} autoComplete="tel" inputMode="tel" name="officePhone" onChange={(e) => set("officePhone", e.target.value)} type="tel" value={values.officePhone} />}
        </Field>
        <Field error={fieldErrors.taxId} hint={t("company.hints.taxId")} label={t("company.fields.taxId")}>
          {(p) => <Input {...p} inputMode="numeric" maxLength={18} name="taxId" onChange={(e) => set("taxId", e.target.value)} value={values.taxId} />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
          <Field error={fieldErrors.city} label={t("company.fields.city")}>
            {(p) => <Input {...p} autoComplete="address-level2" maxLength={80} name="city" onChange={(e) => set("city", e.target.value)} value={values.city} />}
          </Field>
          <Field error={fieldErrors.state} label={t("company.fields.state")}>
            {(p) => (
              <Select {...p} name="state" onChange={(e) => set("state", e.target.value)} value={values.state}>
                <option value="">{t("company.none")}</option>
                {BRAZIL_STATES.map((uf) => (
                  <option key={uf} value={uf}>
                    {uf}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <Field error={fieldErrors.timezone} label={t("company.fields.timezone")} required>
          {(p) => (
            <Select {...p} name="timezone" onChange={(e) => set("timezone", e.target.value)} value={values.timezone}>
              {BRAZIL_TIMEZONES.map((zone) => (
                <option key={zone} value={zone}>
                  {t(`timezones.${zone.replace("America/", "")}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field error={fieldErrors.locale} label={t("company.fields.locale")} required>
            {(p) => (
              <Select {...p} name="locale" onChange={(e) => set("locale", e.target.value === "en" ? "en" : "pt-BR")} value={values.locale}>
                <option value="pt-BR">{t("locales.pt-BR")}</option>
                <option value="en">{t("locales.en")}</option>
              </Select>
            )}
          </Field>
          <Field error={fieldErrors.expectedFieldUsers} label={t("company.fields.expectedFieldUsers")} required>
            {(p) => (
              <Select {...p} name="expectedFieldUsers" onChange={(e) => set("expectedFieldUsers", EXPECTED_FIELD_USERS.find((v) => v === e.target.value) ?? "1-5")} value={values.expectedFieldUsers}>
                {EXPECTED_FIELD_USERS.map((range) => (
                  <option key={range} value={range}>
                    {t(`expectedFieldUsers.${range}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <div className="flex flex-col gap-1">
          <Checkbox checked={values.acceptTerms} label={t("company.acceptTerms")} name="acceptTerms" onChange={(e) => set("acceptTerms", e.target.checked)} />
          <p className="flex flex-wrap gap-x-4 text-sm">
            <a className="inline-flex min-h-12 items-center font-semibold text-[var(--ar-link)]" href={termsUrl} rel="noopener noreferrer" target="_blank">
              {t("company.terms")}
            </a>
            <a className="inline-flex min-h-12 items-center font-semibold text-[var(--ar-link)]" href={privacyUrl} rel="noopener noreferrer" target="_blank">
              {t("company.privacy")}
            </a>
            <a className="inline-flex min-h-12 items-center font-semibold text-[var(--ar-link)]" href={dpaUrl} rel="noopener noreferrer" target="_blank">
              {t("company.dpa")}
            </a>
          </p>
          {fieldErrors.acceptTerms === undefined ? null : (
            <p className="flex items-center gap-1 text-sm font-semibold text-[var(--ar-danger)]" role="alert">
              <span aria-hidden="true">⚠</span>
              {fieldErrors.acceptTerms}
            </p>
          )}
        </div>
        <Button busy={busy} disabled={!values.acceptTerms || values.name.trim().length < 2 || values.officePhone.trim().length === 0} icon={<Building2 aria-hidden="true" className="size-5" />} size="primary" type="submit" variant="primary">
          {t("company.submit")}
        </Button>
        <p className="text-sm text-[var(--ar-text-muted)]">{t("company.trialNote")}</p>
      </form>
    </AuthCard>
  );
}
