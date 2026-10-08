"use client";

import type { OrgSettings } from "@agrorende/contracts/settings";
import { useQuery } from "@tanstack/react-query";
import { PhoneOff, Save } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { Card } from "@/components/data/Detail";
import { LoadingState } from "@/components/data/States";
import { ErrorAlert } from "@/components/recovery/ErrorAlert";
import { UnsavedChangesGuard } from "@/components/recovery/UnsavedChangesGuard";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button, buttonVariants } from "@/components/ui/Button";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/Field";
import { api } from "@/lib/api";
import { useFieldErrors } from "@/lib/forms";
import { useSave } from "@/lib/useSave";

type Settings = OrgSettings & { readonly syncVersion?: string };

const PRIORITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;

/** EC-OPS-25: without an office phone the mobile "Ask the office" button has nowhere to go. */
export function officeContactMissing(s: Pick<OrgSettings, "officePhone" | "officeWhatsApp">): boolean {
  return (s.officePhone ?? "").trim().length === 0 && (s.officeWhatsApp ?? "").trim().length === 0;
}

function NumberField({ label, value, onChange, error, hint, step = 1, min = 0, max }: { readonly label: string; readonly value: number; readonly onChange: (v: number) => void; readonly error?: string; readonly hint?: string; readonly step?: number; readonly min?: number; readonly max?: number }) {
  return (
    <Field error={error} hint={hint} label={label}>
      {(p) => <Input {...p} inputMode="decimal" max={max} min={min} onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))} step={step} type="number" value={Number.isFinite(value) ? value : ""} />}
    </Field>
  );
}

export function SettingsPage() {
  const query = useQuery({ queryKey: ["settings"], queryFn: () => api<Settings>("/settings") });
  if (query.isLoading) return <LoadingState />;
  if (query.error !== null || query.data === undefined) return <ErrorAlert error={query.error} onRetry={() => void query.refetch()} />;
  return <SettingsForm initial={query.data} key={query.data.syncVersion ?? JSON.stringify(query.data)} />;
}

function SettingsForm({ initial }: { readonly initial: Settings }) {
  const t = useTranslations("settings");
  const common = useTranslations("common");
  const [v, setV] = useState<Settings>(initial);
  const [save, state] = useSave("settings", (body: Settings) => {
    const { syncVersion, ...rest } = body;
    return api<Settings>("/settings", { method: "PATCH", body: rest, ...(syncVersion === undefined ? {} : { version: syncVersion }) });
  }, () => toast.success(common("toast.saved")));
  const fe = useFieldErrors()(state.error);
  const dirty = JSON.stringify(v) !== JSON.stringify(initial);
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => setV({ ...v, [key]: value });

  return (
    <form
      className="flex flex-col gap-6"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void save(v);
      }}
    >
      <UnsavedChangesGuard when={dirty} />
      <PageHeader
        actions={
          <>
            <Link className={buttonVariants({ variant: "secondary" })} href="/settings/subscription">
              {t("org.subscription")}
            </Link>
            <Button busy={state.busy} disabled={!dirty} icon={<Save aria-hidden="true" className="size-4" />} type="submit" variant="primary">
              {common("actions.save")}
            </Button>
          </>
        }
        subtitle={t("org.subtitle")}
        title={t("org.title")}
      />
      {state.error === null ? null : <ErrorAlert error={state.error} />}
      {officeContactMissing(v) ? (
        <p className="flex items-start gap-2 rounded-cards bg-[var(--ar-warning-bg)] p-3 text-[var(--ar-warning-text)]" role="status">
          <PhoneOff aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          {t("org.officeMissing")}
        </p>
      ) : null}

      <Card title={t("org.office")}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field error={fe.officePhone} hint={t("org.phoneHint")} label={t("org.officePhone")} required>
            {(p) => <Input {...p} inputMode="tel" onChange={(e) => set("officePhone", e.target.value.trim())} placeholder={t("org.phonePlaceholder")} type="tel" value={v.officePhone ?? ""} />}
          </Field>
          <Field error={fe.officeWhatsApp} hint={t("org.phoneHint")} label={t("org.officeWhatsApp")}>
            {(p) => <Input {...p} inputMode="tel" onChange={(e) => { const value = e.target.value.trim(); const { officeWhatsApp: _drop, ...rest } = v; setV(value.length === 0 ? rest : { ...v, officeWhatsApp: value }); }} placeholder={t("org.phonePlaceholder")} type="tel" value={v.officeWhatsApp ?? ""} />}
          </Field>
        </div>
      </Card>

      <Card title={t("org.sla")}>
        <p className="mb-3 text-sm text-[var(--ar-text-muted)]">{t("org.slaHint")}</p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          {PRIORITIES.map((p) => (
            <NumberField error={fe[`slaHours.${p}`]} key={p} label={t("org.slaHours", { priority: common(`priority.${p}`) })} min={1} onChange={(n) => set("slaHours", { ...v.slaHours, [p]: n })} value={v.slaHours[p]} />
          ))}
          <NumberField error={fe.slaAtRiskRatio} hint={t("org.atRiskHint")} label={t("org.atRisk")} max={1} min={0} onChange={(n) => set("slaAtRiskRatio", n)} step={0.05} value={v.slaAtRiskRatio} />
        </div>
        <div className="mt-3 flex flex-col gap-1">
          <Checkbox checked={v.requireWoSignature} label={t("org.requireWoSignature")} onChange={(e) => set("requireWoSignature", e.target.checked)} />
          <Checkbox checked={v.showLaborCostToManager} label={t("org.showLaborCostToManager")} onChange={(e) => set("showLaborCostToManager", e.target.checked)} />
        </div>
      </Card>

      <Card title={t("org.rentals")}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <NumberField error={fe.rentalGraceHours} label={t("org.rentalGraceHours")} onChange={(n) => set("rentalGraceHours", n)} value={v.rentalGraceHours} />
          <NumberField error={fe.rentalDueSoonHours} label={t("org.rentalDueSoonHours")} onChange={(n) => set("rentalDueSoonHours", n)} value={v.rentalDueSoonHours} />
          <NumberField error={fe["rentalTerms.version"]} hint={t("org.termsVersionHint")} label={t("org.termsVersion")} min={1} onChange={(n) => set("rentalTerms", { ...v.rentalTerms, version: Math.trunc(n) })} value={v.rentalTerms.version} />
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {(["pt-BR", "en"] as const).map((loc) => (
            <Field error={fe[`rentalTerms.text.${loc}`]} key={loc} label={t("org.termsIn", { locale: loc })} required>
              {(p) => <Textarea {...p} onChange={(e) => set("rentalTerms", { ...v.rentalTerms, text: { ...v.rentalTerms.text, [loc]: e.target.value } })} rows={6} value={v.rentalTerms.text[loc] ?? ""} />}
            </Field>
          ))}
        </div>
      </Card>

      <Card title={t("org.field")}>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <NumberField error={fe.defaultSiteRadiusM} label={t("org.defaultSiteRadiusM")} min={10} onChange={(n) => set("defaultSiteRadiusM", n)} value={v.defaultSiteRadiusM} />
          <NumberField error={fe.staleSyncAlertHours} hint={t("org.staleSyncHint")} label={t("org.staleSyncAlertHours")} min={1} onChange={(n) => set("staleSyncAlertHours", n)} value={v.staleSyncAlertHours} />
          <NumberField error={fe["location.intervalSec"]} label={t("org.locationIntervalSec")} min={5} onChange={(n) => set("location", { ...v.location, intervalSec: n })} value={v.location.intervalSec} />
          <NumberField error={fe["location.distanceM"]} label={t("org.locationDistanceM")} min={5} onChange={(n) => set("location", { ...v.location, distanceM: n })} value={v.location.distanceM} />
        </div>
      </Card>

      <Card title={t("org.media")}>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          <NumberField error={fe["media.videoMaxSeconds"]} label={t("org.videoMaxSeconds")} min={5} onChange={(n) => set("media", { ...v.media, videoMaxSeconds: n })} value={v.media.videoMaxSeconds} />
          <NumberField error={fe["media.maxVideosPerReport"]} label={t("org.maxVideosPerReport")} onChange={(n) => set("media", { ...v.media, maxVideosPerReport: n })} value={v.media.maxVideosPerReport} />
          <NumberField error={fe["media.audioMaxSeconds"]} label={t("org.audioMaxSeconds")} min={5} onChange={(n) => set("media", { ...v.media, audioMaxSeconds: n })} value={v.media.audioMaxSeconds} />
          <NumberField error={fe["media.photoMaxPx"]} label={t("org.photoMaxPx")} min={640} onChange={(n) => set("media", { ...v.media, photoMaxPx: n })} step={64} value={v.media.photoMaxPx} />
          <NumberField error={fe["media.photoQuality"]} label={t("org.photoQuality")} max={1} min={0.1} onChange={(n) => set("media", { ...v.media, photoQuality: n })} step={0.05} value={v.media.photoQuality} />
        </div>
      </Card>
    </form>
  );
}
