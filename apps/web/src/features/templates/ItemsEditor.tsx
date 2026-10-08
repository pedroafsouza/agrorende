"use client";

import type { AccessoryDef, ChecklistItem } from "@agrorende/contracts/checklist";
import { SUPPORTED_LOCALES, type LocalizedText } from "@agrorende/contracts/settings";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { MoneyInput } from "@/components/forms/MoneyInput";
import { Button } from "@/components/ui/Button";
import { Checkbox, Field, Input, Select } from "@/components/ui/Field";

export const ITEM_TYPES = ["PASS_FAIL_NA", "NUMBER", "TEXT", "SELECT", "PHOTO"] as const;
export const PHOTO_RULES = ["NEVER", "ALWAYS", "ON_FAIL"] as const;

type Label = LocalizedText;

function move<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  if (item !== undefined) next.splice(to, 0, item);
  return next;
}

function LabelFields({ label, onChange, prefix, fieldErrors }: { readonly label: Label; readonly onChange: (l: Label) => void; readonly prefix: string; readonly fieldErrors: Record<string, string> }) {
  const t = useTranslations("templates");
  return (
    <>
      {SUPPORTED_LOCALES.map((locale) => (
        <Field error={fieldErrors[`${prefix}.label.${locale}`]} key={locale} label={t("editor.labelIn", { locale })} required>
          {(p) => <Input {...p} lang={locale} onChange={(e) => onChange({ ...label, [locale]: e.target.value } as Label)} value={label[locale] ?? ""} />}
        </Field>
      ))}
    </>
  );
}

const optNum = (raw: string): number | undefined => {
  if (raw.trim() === "") return undefined;
  const n = Number(raw.replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
};

export function newItem(index: number): ChecklistItem {
  return { key: `item_${index + 1}`, label: { "pt-BR": "", en: "" }, type: "PASS_FAIL_NA", required: true, isSafetyCritical: false, photo: "ON_FAIL" };
}

export function ItemsEditor({ items, onChange, fieldErrors, disabled }: { readonly items: ChecklistItem[]; readonly onChange: (items: ChecklistItem[]) => void; readonly fieldErrors: Record<string, string>; readonly disabled?: boolean }) {
  const t = useTranslations("templates");
  const update = (index: number, patch: Partial<ChecklistItem>) => onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  return (
    <fieldset className="flex flex-col gap-3" disabled={disabled}>
      <legend className="mb-2 text-lg font-semibold">{t("editor.items")}</legend>
      {fieldErrors.items === undefined ? null : <p className="font-semibold text-[var(--ar-danger-text)]">{fieldErrors.items}</p>}
      {items.map((item, index) => (
        <div className="grid gap-3 rounded-cards border border-[var(--ar-border)] bg-[var(--ar-surface)] p-3 md:grid-cols-4" key={index}>
          <p className="font-semibold md:col-span-4">{t("editor.itemNumber", { n: index + 1 })}</p>
          <Field error={fieldErrors[`items.${index}.key`]} hint={t("editor.keyHint")} label={t("editor.key")} required>
            {(p) => <Input {...p} className="font-mono" onChange={(e) => update(index, { key: e.target.value.replace(/[^a-z0-9_]/giu, "_").toLowerCase() })} value={item.key} />}
          </Field>
          <Field label={t("editor.section")}>
            {(p) => <Input {...p} onChange={(e) => update(index, { section: e.target.value === "" ? undefined : e.target.value })} value={item.section ?? ""} />}
          </Field>
          <LabelFields fieldErrors={fieldErrors} label={item.label} onChange={(label) => update(index, { label })} prefix={`items.${index}`} />
          <Field label={t("editor.type")}>
            {(p) => (
              <Select {...p} onChange={(e) => update(index, { type: e.target.value as ChecklistItem["type"] })} value={item.type}>
                {ITEM_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {t(`itemType.${type}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t("editor.photo")}>
            {(p) => (
              <Select {...p} onChange={(e) => update(index, { photo: e.target.value as ChecklistItem["photo"] })} value={item.photo}>
                {PHOTO_RULES.map((rule) => (
                  <option key={rule} value={rule}>
                    {t(`photoRule.${rule}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <div className="flex flex-col justify-end md:col-span-2">
            <Checkbox checked={item.required} label={t("editor.required")} onChange={(e) => update(index, { required: e.target.checked })} />
            <Checkbox checked={item.isSafetyCritical} label={t("editor.safetyCritical")} onChange={(e) => update(index, { isSafetyCritical: e.target.checked })} />
          </div>
          {item.type === "NUMBER" ? (
            <>
              <Field label={t("editor.unit")}>
                {(p) => <Input {...p} onChange={(e) => update(index, { unit: e.target.value === "" ? undefined : e.target.value })} value={item.unit ?? ""} />}
              </Field>
              <Field error={fieldErrors[`items.${index}.min`]} label={t("editor.min")}>
                {(p) => <Input {...p} inputMode="decimal" onChange={(e) => update(index, { min: optNum(e.target.value) })} value={item.min ?? ""} />}
              </Field>
              <Field error={fieldErrors[`items.${index}.max`]} label={t("editor.max")}>
                {(p) => <Input {...p} inputMode="decimal" onChange={(e) => update(index, { max: optNum(e.target.value) })} value={item.max ?? ""} />}
              </Field>
            </>
          ) : null}
          {item.type === "SELECT" ? (
            <div className="flex flex-col gap-2 md:col-span-4">
              <p className="font-semibold">{t("editor.options")}</p>
              {(item.options ?? []).map((option, oi) => (
                <div className="grid items-end gap-2 md:grid-cols-4" key={oi}>
                  <Field label={t("editor.optionValue")}>
                    {(p) => <Input {...p} className="font-mono" onChange={(e) => update(index, { options: (item.options ?? []).map((o, j) => (j === oi ? { ...o, value: e.target.value } : o)) })} value={option.value} />}
                  </Field>
                  <LabelFields fieldErrors={fieldErrors} label={option.label} onChange={(label) => update(index, { options: (item.options ?? []).map((o, j) => (j === oi ? { ...o, label } : o)) })} prefix={`items.${index}.options.${oi}`} />
                  <Button icon={<Trash2 aria-hidden="true" className="size-4" />} onClick={() => update(index, { options: (item.options ?? []).filter((_, j) => j !== oi) })} variant="ghost">
                    {t("editor.removeOption")}
                  </Button>
                </div>
              ))}
              <div>
                <Button icon={<Plus aria-hidden="true" className="size-4" />} onClick={() => update(index, { options: [...(item.options ?? []), { value: `option_${(item.options ?? []).length + 1}`, label: { "pt-BR": "", en: "" } }] })}>
                  {t("editor.addOption")}
                </Button>
              </div>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2 md:col-span-4">
            <Button disabled={index === 0} icon={<ArrowUp aria-hidden="true" className="size-4" />} onClick={() => onChange(move(items, index, index - 1))} variant="ghost">
              {t("editor.moveUp")}
            </Button>
            <Button disabled={index === items.length - 1} icon={<ArrowDown aria-hidden="true" className="size-4" />} onClick={() => onChange(move(items, index, index + 1))} variant="ghost">
              {t("editor.moveDown")}
            </Button>
            <Button icon={<Trash2 aria-hidden="true" className="size-4" />} onClick={() => onChange(items.filter((_, i) => i !== index))} variant="ghost">
              {t("editor.removeItem")}
            </Button>
          </div>
        </div>
      ))}
      <div>
        <Button icon={<Plus aria-hidden="true" className="size-4" />} onClick={() => onChange([...items, newItem(items.length)])}>
          {t("editor.addItem")}
        </Button>
      </div>
    </fieldset>
  );
}

export function AccessoriesEditor({ accessories, onChange, fieldErrors, disabled }: { readonly accessories: AccessoryDef[]; readonly onChange: (a: AccessoryDef[]) => void; readonly fieldErrors: Record<string, string>; readonly disabled?: boolean }) {
  const t = useTranslations("templates");
  const update = (index: number, patch: Partial<AccessoryDef>) => onChange(accessories.map((a, i) => (i === index ? { ...a, ...patch } : a)));
  return (
    <fieldset className="flex flex-col gap-3" disabled={disabled}>
      <legend className="mb-2 text-lg font-semibold">{t("editor.accessories")}</legend>
      <p className="text-sm text-[var(--ar-text-muted)]">{t("editor.accessoriesHint")}</p>
      {accessories.map((a, index) => (
        <div className="grid items-end gap-3 rounded-cards border border-[var(--ar-border)] bg-[var(--ar-surface)] p-3 md:grid-cols-3" key={index}>
          <Field error={fieldErrors[`accessories.${index}.accessoryKey`]} label={t("editor.key")} required>
            {(p) => <Input {...p} className="font-mono" onChange={(e) => update(index, { accessoryKey: e.target.value.replace(/[^a-z0-9_]/giu, "_").toLowerCase() })} value={a.accessoryKey} />}
          </Field>
          <LabelFields fieldErrors={fieldErrors} label={a.label} onChange={(label) => update(index, { label })} prefix={`accessories.${index}`} />
          <Field label={t("editor.defaultQty")}>
            {(p) => <Input {...p} inputMode="numeric" onChange={(e) => update(index, { defaultQty: Math.max(0, Math.trunc(optNum(e.target.value) ?? 0)) })} value={a.defaultQty} />}
          </Field>
          <Field label={t("editor.replacementCost")}>
            {(p) => <MoneyInput {...p} cents={a.replacementCostCents ?? null} onChange={(c) => update(index, { replacementCostCents: c ?? undefined })} />}
          </Field>
          <Button icon={<Trash2 aria-hidden="true" className="size-4" />} onClick={() => onChange(accessories.filter((_, i) => i !== index))} variant="ghost">
            {t("editor.removeAccessory")}
          </Button>
        </div>
      ))}
      <div>
        <Button icon={<Plus aria-hidden="true" className="size-4" />} onClick={() => onChange([...accessories, { accessoryKey: `accessory_${accessories.length + 1}`, label: { "pt-BR": "", en: "" }, defaultQty: 1 }])}>
          {t("editor.addAccessory")}
        </Button>
      </div>
    </fieldset>
  );
}
