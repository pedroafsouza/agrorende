"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarCheck, CheckCircle2, MapPin, Save, UserCog } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { EntityPicker } from "@/components/forms/EntityPicker";
import { MoneyInput } from "@/components/forms/MoneyInput";
import { ErrorAlert } from "@/components/recovery/ErrorAlert";
import { UnsavedChangesGuard } from "@/components/recovery/UnsavedChangesGuard";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button, buttonVariants } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { api } from "@/lib/api";
import { useFieldErrors } from "@/lib/forms";

import {
  DELIVERY_MODES,
  DOCUMENT_LOCALES,
  EMPTY_NEW_RENTAL,
  RATE_UNITS,
  RENTAL_DIRECTIONS,
  directionLabels,
  inboundMissingOf,
  eligibilityByField,
  eligibilityQuery,
  newRentalBody,
  reserveCodesOf,
  type EligibilityResult,
  type NewRentalValues,
  type RentalDTO,
} from "./types";

interface Draft {
  readonly id: string;
  readonly version: string;
}

/**
 * New rental (RN-01..03). Eligibility is checked live while the user edits; the reserve
 * rejection (EC-RN-01..04) is shown inline next to the field and the draft values stay put.
 */
export function NewRentalPage() {
  const t = useTranslations("rentals");
  const common = useTranslations("common");
  const errors = useTranslations("errors");
  const router = useRouter();
  const client = useQueryClient();
  const fieldErrorsOf = useFieldErrors();
  const [values, setValues] = useState<NewRentalValues>(EMPTY_NEW_RENTAL);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<"draft" | "reserve" | null>(null);
  const [error, setError] = useState<unknown>(null);
  const eligibilityParams = eligibilityQuery(values, draft?.id ?? null);
  const eligibility = useQuery({
    queryKey: ["rentals", "eligibility", eligibilityParams],
    queryFn: () => api<EligibilityResult>("/rentals/eligibility", { query: eligibilityParams ?? {} }),
    enabled: eligibilityParams !== null,
  });
  const set = (patch: Partial<NewRentalValues>) => {
    setValues({ ...values, ...patch });
    setError(null);
  };
  const liveCodes = eligibilityParams === null ? [] : (eligibility.data?.codes ?? []);
  const reserveCodes = reserveCodesOf(error);
  const byField = eligibilityByField([...liveCodes, ...reserveCodes]);
  const fieldErrors = fieldErrorsOf(error);
  const inboundMissing = inboundMissingOf(error);
  const missingText = (part: string): string | undefined => (inboundMissing?.includes(part) === true ? t(`inbound.missing.${part}`) : undefined);
  const labels = directionLabels(values.direction);
  const codeText = (codes: readonly string[] | undefined): string | undefined => (codes === undefined || codes.length === 0 ? undefined : codes.map((code) => errors(`${code}.title`)).join(" · "));
  const siteMismatch = eligibilityParams !== null && (eligibility.data?.warnings ?? []).includes("RENTAL_SITE_MISMATCH") && values.deliveryMode !== "DELIVERY";
  const dirty = JSON.stringify(values) !== JSON.stringify(EMPTY_NEW_RENTAL);
  const ready = values.assetId !== null && values.customerId !== null && values.plannedStart.length > 0 && values.plannedEnd.length > 0;

  /** Creates the draft once, then PATCHes the same draft on retries so a failed reserve never duplicates it. */
  const saveDraft = async (): Promise<Draft> => {
    const body = newRentalBody(values);
    const saved = draft === null ? await api<RentalDTO>("/rentals", { method: "POST", body }) : await api<RentalDTO>(`/rentals/${draft.id}`, { method: "PATCH", body, version: draft.version });
    const next = { id: saved.id, version: saved.syncVersion };
    setDraft(next);
    return next;
  };

  const submit = async (reserve: boolean) => {
    setBusy(reserve ? "reserve" : "draft");
    setError(null);
    try {
      const saved = await saveDraft();
      if (reserve) await api<RentalDTO>(`/rentals/${saved.id}/reserve`, { method: "POST", body: {}, version: saved.version });
      await client.invalidateQueries({ queryKey: ["rentals"] });
      setValues(EMPTY_NEW_RENTAL);
      router.push(`/rentals/${saved.id}`);
    } catch (caught) {
      // A rejected reserve leaves the saved draft untouched, so its id and version stay valid for the retry.
      setError(caught);
    } finally {
      setBusy(null);
    }
  };

  const inlineOnly = reserveCodes.length > 0 || inboundMissing !== null;
  return (
    <div className="flex flex-col gap-4">
      <PageHeader back={{ href: "/rentals", label: t("list.title") }} subtitle={draft === null ? undefined : t("new.draftSaved")} title={t("new.title")} />
      <UnsavedChangesGuard when={dirty && busy === null} />
      <form
        className="flex flex-col gap-4 rounded-cards border border-[var(--ar-border)] bg-[var(--ar-surface)] p-4"
        id="rental-new"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void submit(true);
        }}
      >
        {error === null ? null : inboundMissing !== null ? (
          <div className="rounded-cards border-2 border-[var(--ar-danger)] p-3" role="alert">
            <p className="font-semibold">{t("inbound.incompleteTitle")}</p>
            <p>{t("inbound.incompleteBody")}</p>
            {inboundMissing.includes("season") ? <p>{t("inbound.missing.season")}</p> : null}
          </div>
        ) : inlineOnly ? (
          <p className="rounded-cards border-2 border-[var(--ar-danger)] p-3 font-semibold" role="alert">
            {t("new.reserveBlocked")}
          </p>
        ) : (
          <ErrorAlert error={error} />
        )}
        <Field hint={t(`direction.hint.${values.direction}`)} label={t("fields.direction")}>
          {(p) => (
            <Select {...p} disabled={draft !== null} onChange={(e) => set({ direction: e.target.value as NewRentalValues["direction"], customerId: null })} value={values.direction}>
              {RENTAL_DIRECTIONS.map((d) => (
                <option key={d} value={d}>
                  {t(`direction.${d}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div className="grid gap-4 md:grid-cols-2">
          <Field error={codeText(byField.assetId) ?? missingText("partnerAsset") ?? fieldErrors.assetId} label={t("fields.asset")} required>
            {(p) => <EntityPicker {...p} entity="assets" onChange={(assetId) => set({ assetId })} value={values.assetId} />}
          </Field>
          <div className="flex flex-col gap-2">
            <Field error={codeText(byField.customerId) ?? missingText("supplier") ?? fieldErrors.customerId} label={t(`fields.${labels.party}`)} required>
              {(p) => (
                <EntityPicker
                  {...p}
                  entity="customers"
                  filters={values.direction === "INBOUND" ? { supplier: "true" } : undefined}
                  onChange={(customerId) => set({ customerId })}
                  value={values.customerId}
                />
              )}
            </Field>
            {byField.customerId !== undefined && values.customerId !== null ? (
              <Link className={buttonVariants({ variant: "secondary" })} href={`/customers/${values.customerId}`} target="_blank">
                <UserCog aria-hidden="true" className="size-4" />
                {t("new.completeCustomer")}
              </Link>
            ) : null}
          </div>
          <Field error={codeText(byField.dates) ?? fieldErrors.plannedStart} hint={t("new.timeZoneHint")} label={t("fields.plannedStart")} required>
            {(p) => <Input {...p} onChange={(e) => set({ plannedStart: e.target.value })} type="datetime-local" value={values.plannedStart} />}
          </Field>
          <Field error={byField.dates === undefined ? fieldErrors.plannedEnd : undefined} label={t("fields.plannedEnd")} required>
            {(p) => <Input {...p} aria-invalid={p["aria-invalid"] || byField.dates !== undefined} onChange={(e) => set({ plannedEnd: e.target.value })} type="datetime-local" value={values.plannedEnd} />}
          </Field>
          <Field error={missingText("site") ?? fieldErrors.siteId} label={t("fields.site")} required={values.direction === "INBOUND"}>
            {(p) => <EntityPicker {...p} entity="sites" onChange={(siteId) => set({ siteId })} value={values.siteId} />}
          </Field>
          <Field label={t("fields.documentLocale")}>
            {(p) => (
              <Select {...p} onChange={(e) => set({ documentLocale: e.target.value as NewRentalValues["documentLocale"] })} value={values.documentLocale}>
                {DOCUMENT_LOCALES.map((l) => (
                  <option key={l} value={l}>
                    {t(`documentLocale.${l === "pt-BR" ? "ptBR" : "en"}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        {eligibilityParams === null ? (
          <p className="text-sm text-[var(--ar-text-muted)]">{t("new.eligibilityHint")}</p>
        ) : eligibility.isFetching ? (
          <p aria-live="polite" className="text-sm text-[var(--ar-text-muted)]">
            {t("new.checking")}
          </p>
        ) : eligibility.error === null ? (
          eligibility.data?.eligible === true ? (
            <p aria-live="polite" className="flex items-center gap-2 font-semibold text-[var(--ar-success-text)]">
              <CheckCircle2 aria-hidden="true" className="size-5" />
              {t("new.eligible")}
            </p>
          ) : null
        ) : (
          <ErrorAlert compact error={eligibility.error} onRetry={() => void eligibility.refetch()} />
        )}
        {siteMismatch ? (
          <div className="flex flex-col gap-2 rounded-cards border-2 border-[var(--ar-warning)] p-4" role="status">
            <p className="flex items-center gap-2 font-semibold">
              <MapPin aria-hidden="true" className="size-5" />
              {errors("RENTAL_SITE_MISMATCH.title")}
            </p>
            <p>{errors("RENTAL_SITE_MISMATCH.body")}</p>
            <div>
              <Button onClick={() => set({ deliveryMode: "DELIVERY" })}>{t("new.switchToDelivery")}</Button>
            </div>
          </div>
        ) : null}
        <div className="grid gap-4 md:grid-cols-3">
          <Field error={fieldErrors.rateCents} hint={t("new.rateHint")} label={t("fields.rate")}>
            {(p) => <MoneyInput {...p} cents={values.rateCents} onChange={(rateCents) => set({ rateCents })} />}
          </Field>
          <Field error={fieldErrors.rateUnit} label={t("fields.rateUnit")}>
            {(p) => (
              <Select {...p} onChange={(e) => set({ rateUnit: e.target.value as NewRentalValues["rateUnit"] })} value={values.rateUnit}>
                <option value="">{t("new.assetDefault")}</option>
                {RATE_UNITS.map((unit) => (
                  <option key={unit} value={unit}>
                    {common(`rateUnit.${unit}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field error={fieldErrors.depositCents} label={t("fields.deposit")}>
            {(p) => <MoneyInput {...p} cents={values.depositCents} onChange={(depositCents) => set({ depositCents })} />}
          </Field>
          <Field label={t("fields.deliveryMode")}>
            {(p) => (
              <Select {...p} onChange={(e) => set({ deliveryMode: e.target.value as NewRentalValues["deliveryMode"] })} value={values.deliveryMode}>
                {DELIVERY_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {t(`deliveryMode.${mode}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {values.deliveryMode === "DELIVERY" ? (
            <Field className="md:col-span-2" error={fieldErrors.deliveryAddress} label={t("fields.deliveryAddress")}>
              {(p) => <Input {...p} maxLength={500} onChange={(e) => set({ deliveryAddress: e.target.value })} value={values.deliveryAddress} />}
            </Field>
          ) : null}
        </div>
        <Field error={fieldErrors.notes} label={t("fields.notes")}>
          {(p) => <Textarea {...p} maxLength={500} onChange={(e) => set({ notes: e.target.value })} rows={3} value={values.notes} />}
        </Field>
        <div className="flex flex-wrap justify-end gap-2">
          <Button onClick={() => router.push("/rentals")}>{common("actions.cancel")}</Button>
          <Button pending={busy === "draft"} disabled={!ready || busy !== null} icon={<Save aria-hidden="true" className="size-4" />} onClick={() => void submit(false)}>
            {t("actions.saveDraft")}
          </Button>
          <Button pending={busy === "reserve"} disabled={!ready || busy !== null} icon={<CalendarCheck aria-hidden="true" className="size-4" />} size="primary" type="submit" variant="primary">
            {t("actions.createAndReserve")}
          </Button>
        </div>
      </form>
    </div>
  );
}
