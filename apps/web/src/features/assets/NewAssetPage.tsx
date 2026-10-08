"use client";

import { Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { ErrorAlert } from "@/components/recovery/ErrorAlert";
import { UnsavedChangesGuard } from "@/components/recovery/UnsavedChangesGuard";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api";
import { useSave } from "@/lib/useSave";

import { AssetFields, assetBody, useAssetFormState } from "./AssetForm";
import type { AssetDTO } from "./types";

export function NewAssetPage() {
  const t = useTranslations("assets");
  const common = useTranslations("common");
  const router = useRouter();
  const form = useAssetFormState();
  const [save, state] = useSave("assets", (body: Record<string, unknown>) => api<AssetDTO>("/assets", { method: "POST", body }), (asset) => router.push(`/assets/${asset.id}`));
  return (
    <div className="flex flex-col gap-4">
      <PageHeader back={{ href: "/assets", label: t("list.title") }} title={t("new.title")} />
      <UnsavedChangesGuard when={form.dirty && !state.busy} />
      <form
        className="flex flex-col gap-4 rounded-cards border border-[var(--ar-border)] bg-[var(--ar-surface)] p-4"
        id="asset-new"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void save(assetBody(form.values, "create"));
        }}
      >
        {state.error === null ? null : <ErrorAlert error={state.error} />}
        <AssetFields error={state.error} mode="create" onChange={form.setValues} values={form.values} />
        <div className="flex justify-end gap-2">
          <Button onClick={() => router.push("/assets")}>{common("actions.cancel")}</Button>
          <Button busy={state.busy} icon={<Save aria-hidden="true" className="size-4" />} size="primary" type="submit" variant="primary">
            {t("actions.create")}
          </Button>
        </div>
      </form>
    </div>
  );
}
