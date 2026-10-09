"use client";

import { AssetCategoryEnum, type AssetCategory } from "@agrorende/contracts/enums";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { EntityPicker } from "@/components/forms/EntityPicker";
import { FormDialog } from "@/components/forms/FormDialog";
import { Field, Input, Select } from "@/components/ui/Field";
import { api } from "@/lib/api";

import type { FieldReportDetail } from "./types";

export type LinkAssetMode = "existing" | "create";

export interface LinkAssetValues {
  readonly mode: LinkAssetMode;
  readonly assetId: string | null;
  readonly name: string;
  readonly category: AssetCategory;
}

/** Field errors for the link-asset form, as message keys under `reports.dialogs.linkAsset`. */
export function linkAssetErrors(values: LinkAssetValues): Partial<Record<"assetId" | "name", string>> {
  if (values.mode === "existing") return values.assetId === null ? { assetId: "pickRequired" } : {};
  return values.name.trim().length === 0 ? { name: "nameRequired" } : {};
}

/**
 * Link an unregistered machine (FR-22, P1): pick an existing asset or create one from the report's
 * description, then `POST /field-reports/:id/link-asset {assetId}`. A created asset that fails to link
 * stays in the fleet and is reused on retry, so nothing is created twice.
 */
export function LinkAssetDialog({ report, onClose, onDone }: { readonly report: FieldReportDetail; readonly onClose: () => void; readonly onDone: () => void }) {
  const t = useTranslations("reports");
  const common = useTranslations("common");
  const [values, setValues] = useState<LinkAssetValues>({ mode: "existing", assetId: null, name: report.unregisteredAssetDesc ?? "", category: "OTHER" });
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const errors = touched ? linkAssetErrors(values) : {};

  const submit = async () => {
    setTouched(true);
    if (Object.keys(linkAssetErrors(values)).length > 0) return;
    setBusy(true);
    setError(null);
    try {
      let assetId = values.assetId;
      if (values.mode === "create") {
        assetId = createdId;
        if (assetId === null) {
          const created = await api<{ id: string }>("/assets", { method: "POST", body: { name: values.name.trim(), category: values.category } });
          assetId = created.id;
          setCreatedId(assetId);
        }
      }
      await api<unknown>(`/field-reports/${report.id}/link-asset`, { method: "POST", body: { assetId } });
      onDone();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormDialog
      busy={busy}
      dirty={values.assetId !== null || values.mode === "create"}
      error={error}
      formId="link-asset"
      onClose={onClose}
      onSubmit={() => void submit()}
      open
      submitLabel={t("dialogs.linkAsset.submit")}
      title={t("dialogs.linkAsset.title")}
    >
      <p>{t("dialogs.linkAsset.body", { description: report.unregisteredAssetDesc ?? "—" })}</p>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold">{t("dialogs.linkAsset.mode")}</legend>
        {(["existing", "create"] as const).map((mode) => (
          <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-controls border border-[var(--ar-border-strong)] px-3" key={mode}>
            <input checked={values.mode === mode} className="size-5" name="link-asset-mode" onChange={() => setValues({ ...values, mode })} type="radio" value={mode} />
            {t(`dialogs.linkAsset.modes.${mode}`)}
          </label>
        ))}
      </fieldset>
      {values.mode === "existing" ? (
        <Field error={errors.assetId === undefined ? undefined : t(`dialogs.linkAsset.${errors.assetId}`)} label={t("fields.asset")} required>
          {(p) => <EntityPicker {...p} entity="assets" onChange={(assetId) => setValues({ ...values, assetId })} value={values.assetId} />}
        </Field>
      ) : (
        <>
          <Field error={errors.name === undefined ? undefined : t(`dialogs.linkAsset.${errors.name}`)} label={t("dialogs.linkAsset.name")} required>
            {(p) => <Input {...p} disabled={createdId !== null} maxLength={200} onChange={(e) => setValues({ ...values, name: e.target.value })} value={values.name} />}
          </Field>
          <Field label={t("dialogs.linkAsset.category")}>
            {(p) => (
              <Select {...p} disabled={createdId !== null} onChange={(e) => setValues({ ...values, category: e.target.value as AssetCategory })} value={values.category}>
                {AssetCategoryEnum.options.map((c) => (
                  <option key={c} value={c}>
                    {common(`category.${c}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </>
      )}
    </FormDialog>
  );
}
