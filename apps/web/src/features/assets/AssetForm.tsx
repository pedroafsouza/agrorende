"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { EntityPicker } from "@/components/forms/EntityPicker";
import { MoneyInput } from "@/components/forms/MoneyInput";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/Field";
import { nullIfEmpty, numberOrNull, useFieldErrors } from "@/lib/forms";

import { CATEGORIES, OWNER_TYPES, RATE_UNITS, type AssetDTO } from "./types";

export interface AssetFormValues {
  code: string;
  name: string;
  category: string;
  make: string;
  model: string;
  year: string;
  serialNumber: string;
  plate: string;
  ownerType: string;
  ownerCustomerId: string | null;
  homeSiteId: string | null;
  hourMeter: string;
  odometerKm: string;
  tankCapacityL: string;
  isRentable: boolean;
  defaultRateCents: number | null;
  defaultRateUnit: string;
  notes: string;
}

export function assetFormValues(asset?: AssetDTO): AssetFormValues {
  return {
    code: asset?.code ?? "",
    name: asset?.name ?? "",
    category: asset?.category ?? "TRACTOR",
    make: asset?.make ?? "",
    model: asset?.model ?? "",
    year: asset?.year === null || asset?.year === undefined ? "" : String(asset.year),
    serialNumber: asset?.serialNumber ?? "",
    plate: asset?.plate ?? "",
    ownerType: asset?.ownerType ?? "ORGANIZATION",
    ownerCustomerId: asset?.ownerCustomerId ?? null,
    homeSiteId: asset?.homeSiteId ?? null,
    hourMeter: asset?.hourMeter === null || asset?.hourMeter === undefined ? "" : String(asset.hourMeter),
    odometerKm: asset?.odometerKm === null || asset?.odometerKm === undefined ? "" : String(asset.odometerKm),
    tankCapacityL: asset?.tankCapacityL === null || asset?.tankCapacityL === undefined ? "" : String(asset.tankCapacityL),
    isRentable: asset?.isRentable ?? false,
    defaultRateCents: asset?.defaultRateCents ?? null,
    defaultRateUnit: asset?.defaultRateUnit ?? "",
    notes: asset?.notes ?? "",
  };
}

export function assetBody(v: AssetFormValues, mode: "create" | "edit"): Record<string, unknown> {
  const body: Record<string, unknown> = {
    code: nullIfEmpty(v.code),
    name: v.name.trim(),
    category: v.category,
    make: nullIfEmpty(v.make),
    model: nullIfEmpty(v.model),
    year: numberOrNull(v.year),
    serialNumber: nullIfEmpty(v.serialNumber),
    plate: nullIfEmpty(v.plate),
    ownerType: v.ownerType,
    ownerCustomerId: v.ownerType === "ORGANIZATION" ? null : v.ownerCustomerId,
    homeSiteId: v.homeSiteId,
    tankCapacityL: numberOrNull(v.tankCapacityL),
    isRentable: v.isRentable,
    defaultRateCents: v.isRentable ? v.defaultRateCents : null,
    defaultRateUnit: v.isRentable && v.defaultRateUnit.length > 0 ? v.defaultRateUnit : null,
    notes: nullIfEmpty(v.notes),
  };
  if (mode === "create") {
    body.hourMeter = numberOrNull(v.hourMeter);
    body.odometerKm = numberOrNull(v.odometerKm);
  }
  return body;
}

/** Shared create/edit fields. Meter readings are only typed at creation; afterwards they come from field work (A§6.4). */
export function AssetFields({ values, onChange, error, mode }: { readonly values: AssetFormValues; readonly onChange: (v: AssetFormValues) => void; readonly error: unknown; readonly mode: "create" | "edit" }) {
  const t = useTranslations("assets");
  const common = useTranslations("common");
  const fieldErrors = useFieldErrors()(error);
  const set = <K extends keyof AssetFormValues>(key: K, value: AssetFormValues[K]) => onChange({ ...values, [key]: value });
  const text = (key: "code" | "name" | "make" | "model" | "serialNumber" | "plate", required = false) => (
    <Field error={fieldErrors[key]} label={t(`fields.${key}`)} required={required}>
      {(p) => <Input {...p} name={key} onChange={(e) => set(key, e.target.value)} value={values[key]} />}
    </Field>
  );
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {text("name", true)}
      <Field error={fieldErrors.code} hint={mode === "create" ? t("hints.code") : undefined} label={t("fields.code")}>
        {(p) => <Input {...p} name="code" onChange={(e) => set("code", e.target.value)} value={values.code} />}
      </Field>
      <Field error={fieldErrors.category} label={t("fields.category")} required>
        {(p) => (
          <Select {...p} name="category" onChange={(e) => set("category", e.target.value)} value={values.category}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {common(`category.${c}`)}
              </option>
            ))}
          </Select>
        )}
      </Field>
      {text("make")}
      {text("model")}
      <Field error={fieldErrors.year} label={t("fields.year")}>
        {(p) => <Input {...p} inputMode="numeric" name="year" onChange={(e) => set("year", e.target.value)} value={values.year} />}
      </Field>
      {text("serialNumber")}
      {text("plate")}
      <Field error={fieldErrors.homeSiteId} label={t("fields.homeSite")}>
        {(p) => <EntityPicker {...p} entity="sites" name="homeSiteId" onChange={(id) => set("homeSiteId", id)} value={values.homeSiteId} />}
      </Field>
      <Field error={fieldErrors.ownerType} label={t("fields.ownerType")}>
        {(p) => (
          <Select {...p} name="ownerType" onChange={(e) => set("ownerType", e.target.value)} value={values.ownerType}>
            {OWNER_TYPES.map((o) => (
              <option key={o} value={o}>
                {t(`ownerType.${o}`)}
              </option>
            ))}
          </Select>
        )}
      </Field>
      {values.ownerType === "ORGANIZATION" ? null : (
        <Field error={fieldErrors.ownerCustomerId} label={t("fields.ownerCustomer")}>
          {(p) => <EntityPicker {...p} entity="customers" name="ownerCustomerId" onChange={(id) => set("ownerCustomerId", id)} value={values.ownerCustomerId} />}
        </Field>
      )}
      {mode === "create" ? (
        <>
          <Field error={fieldErrors.hourMeter} hint={t("hints.meters")} label={t("fields.hourMeter")}>
            {(p) => <Input {...p} inputMode="decimal" name="hourMeter" onChange={(e) => set("hourMeter", e.target.value)} value={values.hourMeter} />}
          </Field>
          <Field error={fieldErrors.odometerKm} label={t("fields.odometerKm")}>
            {(p) => <Input {...p} inputMode="decimal" name="odometerKm" onChange={(e) => set("odometerKm", e.target.value)} value={values.odometerKm} />}
          </Field>
        </>
      ) : null}
      <Field error={fieldErrors.tankCapacityL} label={t("fields.tankCapacityL")}>
        {(p) => <Input {...p} inputMode="decimal" name="tankCapacityL" onChange={(e) => set("tankCapacityL", e.target.value)} value={values.tankCapacityL} />}
      </Field>
      <div className="sm:col-span-2">
        <Checkbox checked={values.isRentable} label={t("fields.isRentable")} name="isRentable" onChange={(e) => set("isRentable", e.target.checked)} />
      </div>
      {values.isRentable ? (
        <>
          <Field error={fieldErrors.defaultRateCents} label={t("fields.defaultRate")}>
            {(p) => <MoneyInput {...p} cents={values.defaultRateCents} name="defaultRateCents" onChange={(c) => set("defaultRateCents", c)} />}
          </Field>
          <Field error={fieldErrors.defaultRateUnit} label={t("fields.defaultRateUnit")}>
            {(p) => (
              <Select {...p} name="defaultRateUnit" onChange={(e) => set("defaultRateUnit", e.target.value)} value={values.defaultRateUnit}>
                <option value="">{common("picker.none")}</option>
                {RATE_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {common(`rateUnit.${u}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </>
      ) : null}
      <Field className="sm:col-span-2" error={fieldErrors.notes} label={t("fields.notes")}>
        {(p) => <Textarea {...p} name="notes" onChange={(e) => set("notes", e.target.value)} value={values.notes} />}
      </Field>
    </div>
  );
}

export function useAssetFormState(asset?: AssetDTO) {
  const [initial] = useState(() => assetFormValues(asset));
  const [values, setValues] = useState(initial);
  const dirty = JSON.stringify(values) !== JSON.stringify(initial);
  return { values, setValues, dirty, reset: () => setValues(assetFormValues(asset)) };
}
