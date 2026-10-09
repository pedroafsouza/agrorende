"use client";

import type { CustomerDTO } from "@agrorende/contracts/dto";
import { useTranslations } from "next-intl";

import { CpfCnpjInput, taxIdError } from "@/components/forms/CpfCnpjInput";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/Field";
import { nullIfEmpty, useFieldErrors } from "@/lib/forms";

export interface CustomerFormValues {
  name: string;
  tradeName: string;
  taxId: string;
  phone: string;
  whatsapp: string;
  email: string;
  address: string;
  city: string;
  state: string;
  isSupplier: boolean;
  notes: string;
}

export function customerFormValues(c?: CustomerDTO): CustomerFormValues {
  return {
    name: c?.name ?? "",
    tradeName: c?.tradeName ?? "",
    taxId: c?.taxId ?? "",
    phone: c?.phone ?? "",
    whatsapp: c?.whatsapp ?? "",
    email: c?.email ?? "",
    address: c?.address ?? "",
    city: c?.city ?? "",
    state: c?.state ?? "",
    isSupplier: c?.isSupplier ?? false,
    notes: c?.notes ?? "",
  };
}

/** The tax ID is only sent when typed or changed, so a masked value never overwrites the stored one. */
export function customerBody(v: CustomerFormValues, initial?: CustomerFormValues): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name: v.name.trim(),
    tradeName: nullIfEmpty(v.tradeName),
    phone: nullIfEmpty(v.phone),
    whatsapp: nullIfEmpty(v.whatsapp),
    email: nullIfEmpty(v.email),
    address: nullIfEmpty(v.address),
    city: nullIfEmpty(v.city),
    state: nullIfEmpty(v.state),
    isSupplier: v.isSupplier,
    notes: nullIfEmpty(v.notes),
  };
  if (initial === undefined || initial.taxId !== v.taxId) body.taxId = nullIfEmpty(v.taxId.replace(/\D/gu, ""));
  return body;
}

/** Keeps only the entries of `next` that differ from `base`, so a conflict merge never overwrites someone else's fields. */
export function changedFields(next: Record<string, unknown>, base: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(next).filter(([key, value]) => base[key] !== value));
}

export function CustomerFields({ values, onChange, error }: { readonly values: CustomerFormValues; readonly onChange: (v: CustomerFormValues) => void; readonly error: unknown }) {
  const t = useTranslations("assets");
  const common = useTranslations("common");
  const fe = useFieldErrors()(error);
  const set = <K extends keyof CustomerFormValues>(key: K, value: CustomerFormValues[K]) => onChange({ ...values, [key]: value });
  const text = (key: "name" | "tradeName" | "phone" | "whatsapp" | "email" | "address" | "city" | "state", opts: { required?: boolean; type?: string; inputMode?: "tel" | "email" } = {}) => (
    <Field error={fe[key]} label={t(`customers.fields.${key}`)} required={opts.required}>
      {(p) => <Input {...p} inputMode={opts.inputMode} name={key} onChange={(e) => set(key, e.target.value)} type={opts.type} value={values[key]} />}
    </Field>
  );
  const localTaxError = taxIdError(values.taxId) === null ? undefined : common("validation.taxId");
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {text("name", { required: true })}
      {text("tradeName")}
      <Field error={fe.taxId ?? localTaxError} hint={t("customers.hints.taxId")} label={t("customers.fields.taxId")}>
        {(p) => <CpfCnpjInput {...p} name="taxId" onChange={(v) => set("taxId", v)} value={values.taxId} />}
      </Field>
      {text("email", { type: "email", inputMode: "email" })}
      {text("phone", { type: "tel", inputMode: "tel" })}
      {text("whatsapp", { type: "tel", inputMode: "tel" })}
      {text("address")}
      {text("city")}
      {text("state")}
      <div className="flex items-end">
        <Checkbox checked={values.isSupplier} label={t("customers.fields.isSupplier")} name="isSupplier" onChange={(e) => set("isSupplier", e.target.checked)} />
      </div>
      <Field className="sm:col-span-2" error={fe.notes} label={t("customers.fields.notes")}>
        {(p) => <Textarea {...p} name="notes" onChange={(e) => set("notes", e.target.value)} value={values.notes} />}
      </Field>
    </div>
  );
}
