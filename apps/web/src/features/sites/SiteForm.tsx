"use client";

import type { SiteDTO } from "@agrorende/contracts/dto";
import { SiteTypeEnum } from "@agrorende/contracts/enums";
import { useTranslations } from "next-intl";

import { EntityPicker } from "@/components/forms/EntityPicker";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { nullIfEmpty, numberOrNull, useFieldErrors } from "@/lib/forms";

export const SITE_TYPES = SiteTypeEnum.options;

export interface SiteFormValues {
  name: string;
  type: string;
  customerId: string | null;
  address: string;
  city: string;
  state: string;
  lat: string;
  lng: string;
  radiusM: string;
  notes: string;
}

export function siteFormValues(site?: SiteDTO): SiteFormValues {
  const num = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v));
  return {
    name: site?.name ?? "",
    type: site?.type ?? "FARM",
    customerId: site?.customerId ?? null,
    address: site?.address ?? "",
    city: site?.city ?? "",
    state: site?.state ?? "",
    lat: num(site?.lat),
    lng: num(site?.lng),
    radiusM: site === undefined ? "200" : String(site.radiusM),
    notes: site?.notes ?? "",
  };
}

export function siteBody(v: SiteFormValues): Record<string, unknown> {
  return {
    name: v.name.trim(),
    type: v.type,
    customerId: v.customerId,
    address: nullIfEmpty(v.address),
    city: nullIfEmpty(v.city),
    state: nullIfEmpty(v.state),
    lat: numberOrNull(v.lat),
    lng: numberOrNull(v.lng),
    radiusM: numberOrNull(v.radiusM) ?? 200,
    notes: nullIfEmpty(v.notes),
  };
}

export function SiteFields({ values, onChange, error }: { readonly values: SiteFormValues; readonly onChange: (v: SiteFormValues) => void; readonly error: unknown }) {
  const t = useTranslations("assets");
  const fe = useFieldErrors()(error);
  const set = <K extends keyof SiteFormValues>(key: K, value: SiteFormValues[K]) => onChange({ ...values, [key]: value });
  const text = (key: "name" | "address" | "city" | "state", required = false) => (
    <Field error={fe[key]} label={t(`sites.fields.${key}`)} required={required}>
      {(p) => <Input {...p} name={key} onChange={(e) => set(key, e.target.value)} value={values[key]} />}
    </Field>
  );
  const coord = (key: "lat" | "lng" | "radiusM") => (
    <Field error={fe[key]} label={t(`sites.fields.${key}`)}>
      {(p) => <Input {...p} inputMode="decimal" name={key} onChange={(e) => set(key, e.target.value)} value={values[key]} />}
    </Field>
  );
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {text("name", true)}
      <Field error={fe.type} label={t("sites.fields.type")} required>
        {(p) => (
          <Select {...p} name="type" onChange={(e) => set("type", e.target.value)} value={values.type}>
            {SITE_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`sites.type.${type}`)}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field error={fe.customerId} label={t("sites.fields.customer")}>
        {(p) => <EntityPicker {...p} entity="customers" name="customerId" onChange={(id) => set("customerId", id)} value={values.customerId} />}
      </Field>
      {text("address")}
      {text("city")}
      {text("state")}
      {coord("lat")}
      {coord("lng")}
      {coord("radiusM")}
      <Field className="sm:col-span-2" error={fe.notes} label={t("sites.fields.notes")}>
        {(p) => <Textarea {...p} name="notes" onChange={(e) => set("notes", e.target.value)} value={values.notes} />}
      </Field>
    </div>
  );
}
