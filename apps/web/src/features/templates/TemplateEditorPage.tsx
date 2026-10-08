"use client";

import type { AccessoryDef, ChecklistItem } from "@agrorende/contracts/checklist";
import type { ChecklistTemplateDTO } from "@agrorende/contracts/dto";
import { AssetCategoryEnum, ChecklistKindEnum } from "@agrorende/contracts/enums";
import { useQuery } from "@tanstack/react-query";
import { Archive, ArchiveRestore, Save, Send, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Card } from "@/components/data/Detail";
import { LoadingState } from "@/components/data/States";
import { ConfirmDialog } from "@/components/forms/ConfirmDialog";
import { ConflictActions } from "@/components/recovery/ConflictActions";
import { ErrorAlert } from "@/components/recovery/ErrorAlert";
import { UnsavedChangesGuard } from "@/components/recovery/UnsavedChangesGuard";
import { PageHeader } from "@/components/shell/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Checkbox, Field, Input } from "@/components/ui/Field";
import { api, isApiError } from "@/lib/api";
import { useFieldErrors } from "@/lib/forms";
import { useSave } from "@/lib/useSave";

import { AccessoriesEditor, ItemsEditor, newItem } from "./ItemsEditor";

type TemplateWithUse = ChecklistTemplateDTO & { inUse: number };

interface Meta {
  name: string;
  appliesTo: string[];
  assetCategories: string[];
  isActive: boolean;
}

const metaOf = (t?: ChecklistTemplateDTO): Meta => ({ name: t?.name ?? "", appliesTo: [...(t?.appliesTo ?? ["WORK_ORDER"])], assetCategories: [...(t?.assetCategories ?? [])], isActive: t?.isActive ?? true });

function MetaFields({ meta, onChange, error }: { readonly meta: Meta; readonly onChange: (m: Meta) => void; readonly error: unknown }) {
  const t = useTranslations("templates");
  const common = useTranslations("common");
  const fe = useFieldErrors()(error);
  const toggle = (list: string[], value: string, on: boolean) => (on ? [...list, value] : list.filter((v) => v !== value));
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Field error={fe.name} label={t("fields.name")} required>
        {(p) => <Input {...p} onChange={(e) => onChange({ ...meta, name: e.target.value })} value={meta.name} />}
      </Field>
      <div className="flex items-end">
        <Checkbox checked={meta.isActive} label={t("fields.isActive")} onChange={(e) => onChange({ ...meta, isActive: e.target.checked })} />
      </div>
      <fieldset className="md:col-span-2">
        <legend className="mb-1 font-semibold">{t("fields.appliesTo")}</legend>
        <div className="flex flex-wrap gap-x-4">
          {ChecklistKindEnum.options.map((k) => (
            <Checkbox checked={meta.appliesTo.includes(k)} key={k} label={t(`kind.${k}`)} onChange={(e) => onChange({ ...meta, appliesTo: toggle(meta.appliesTo, k, e.target.checked) })} />
          ))}
        </div>
        {fe.appliesTo === undefined ? null : <p className="font-semibold text-[var(--ar-danger-text)]">{fe.appliesTo}</p>}
      </fieldset>
      <fieldset className="md:col-span-2">
        <legend className="mb-1 font-semibold">{t("fields.assetCategories")}</legend>
        <p className="text-sm text-[var(--ar-text-muted)]">{t("hints.assetCategories")}</p>
        <div className="flex flex-wrap gap-x-4">
          {AssetCategoryEnum.options.map((c) => (
            <Checkbox checked={meta.assetCategories.includes(c)} key={c} label={common(`category.${c}`)} onChange={(e) => onChange({ ...meta, assetCategories: toggle(meta.assetCategories, c, e.target.checked) })} />
          ))}
        </div>
      </fieldset>
    </div>
  );
}

export function TemplateEditorPage({ id }: { readonly id: string }) {
  const t = useTranslations("templates");
  const common = useTranslations("common");
  const router = useRouter();
  const isNew = id === "new";
  const query = useQuery({ queryKey: ["checklist-templates", id], queryFn: () => api<TemplateWithUse>(`/checklist-templates/${id}`), enabled: !isNew });
  const template = query.data;
  const [meta, setMeta] = useState<Meta>(metaOf());
  const [items, setItems] = useState<ChecklistItem[]>([newItem(0)]);
  const [accessories, setAccessories] = useState<AccessoryDef[]>([]);
  const [loadedVersion, setLoadedVersion] = useState<string | null>(null);
  const [inUseConfirm, setInUseConfirm] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const mapFieldErrors = useFieldErrors();

  useEffect(() => {
    if (template !== undefined && loadedVersion === null) {
      setMeta(metaOf(template));
      setItems(template.items);
      setAccessories(template.accessories);
      setLoadedVersion(template.syncVersion);
    }
  }, [template, loadedVersion]);

  const [create, createState] = useSave("checklist-templates", (body: Record<string, unknown>) => api<ChecklistTemplateDTO>("/checklist-templates", { method: "POST", body }), (created) => {
    toast.success(common("toast.saved"));
    router.replace(`/templates/${created.id}`);
  });
  const [saveMeta, metaState] = useSave("checklist-templates", (body: Record<string, unknown>, version: string) => api<ChecklistTemplateDTO>(`/checklist-templates/${id}`, { method: "PATCH", body, version }), (updated) => {
    setLoadedVersion(updated.syncVersion);
    toast.success(common("toast.saved"));
  });
  const [publish, publishState] = useSave(
    "checklist-templates",
    (confirmInUse: boolean, version: string) => api<ChecklistTemplateDTO>(`/checklist-templates/${id}/publish`, { method: "POST", body: { items, accessories, confirmInUse }, version }),
    (updated) => {
      setInUseConfirm(null);
      setLoadedVersion(updated.syncVersion);
      toast.success(t("published", { n: updated.templateVersion }));
    },
  );

  useEffect(() => {
    if (isApiError(publishState.error, "TEMPLATE_VERSION_IN_USE")) {
      const inUse = publishState.error.details.inUse;
      setInUseConfirm(typeof inUse === "number" ? inUse : (template?.inUse ?? 0));
    }
  }, [publishState.error, template?.inUse]);

  if (!isNew && query.isLoading) return <LoadingState />;
  if (!isNew && (query.error !== null || template === undefined)) return <ErrorAlert error={query.error} onRetry={() => void query.refetch()} />;

  const dirty = isNew
    ? meta.name.length > 0
    : template !== undefined && (JSON.stringify(metaOf(template)) !== JSON.stringify(meta) || JSON.stringify(template.items) !== JSON.stringify(items) || JSON.stringify(template.accessories) !== JSON.stringify(accessories));
  const archived = template?.archivedAt !== null && template?.archivedAt !== undefined;
  const fieldErrors = mapFieldErrors(createState.error ?? publishState.error);
  const version = template?.syncVersion ?? "";
  const busy = createState.busy || metaState.busy || publishState.busy;

  return (
    <div className="flex flex-col gap-6">
      <UnsavedChangesGuard when={dirty && !busy} />
      <PageHeader
        actions={
          isNew ? undefined : (
            <>
              <Button icon={archived ? <ArchiveRestore aria-hidden="true" className="size-4" /> : <Archive aria-hidden="true" className="size-4" />} onClick={() => void saveMeta({ archived: !archived }, version)}>
                {archived ? common("actions.unarchive") : common("actions.archive")}
              </Button>
              <Button icon={<Trash2 aria-hidden="true" className="size-4" />} onClick={() => setDeleting(true)} variant="danger">
                {common("actions.delete")}
              </Button>
            </>
          )
        }
        back={{ href: "/templates", label: t("list.title") }}
        subtitle={
          template === undefined ? undefined : (
            <span className="flex flex-wrap items-center gap-2">
              <Badge tone="info">{t("version", { n: template.templateVersion })}</Badge>
              {template.inUse > 0 ? <Badge tone="warning">{t("inUse", { count: template.inUse })}</Badge> : null}
              {archived ? <Badge tone="neutral">{common("states.archived")}</Badge> : null}
            </span>
          )
        }
        title={isNew ? t("new.title") : (template?.name ?? "")}
      />
      <Card title={t("editor.details")}>
        {metaState.error === null ? null : (
          <ErrorAlert
            action={metaState.conflict ? <ConflictActions onKeepMine={() => void query.refetch().then((r) => (r.data === undefined ? undefined : saveMeta({ ...meta }, r.data.syncVersion)))} onUseTheirs={() => { setLoadedVersion(null); void query.refetch(); }} /> : undefined}
            error={metaState.error}
          />
        )}
        <MetaFields error={metaState.error ?? createState.error} meta={meta} onChange={setMeta} />
        {isNew ? null : (
          <div className="mt-4 flex justify-end">
            <Button busy={metaState.busy} icon={<Save aria-hidden="true" className="size-4" />} onClick={() => void saveMeta({ ...meta }, version)}>
              {t("actions.saveDetails")}
            </Button>
          </div>
        )}
      </Card>
      {isNew ? null : <p className="rounded-cards border border-[var(--ar-info-text)] bg-[var(--ar-info-bg)] p-3">{t("editor.publishHint")}</p>}
      <ItemsEditor disabled={archived} fieldErrors={fieldErrors} items={items} onChange={setItems} />
      <AccessoriesEditor accessories={accessories} disabled={archived} fieldErrors={fieldErrors} onChange={setAccessories} />
      {createState.error === null ? null : <ErrorAlert error={createState.error} />}
      {publishState.error === null || isApiError(publishState.error, "TEMPLATE_VERSION_IN_USE") ? null : (
        <ErrorAlert action={publishState.conflict ? <ConflictActions onKeepMine={() => void query.refetch().then((r) => (r.data === undefined ? undefined : publish(false, r.data.syncVersion)))} onUseTheirs={() => { setLoadedVersion(null); void query.refetch(); }} /> : undefined} error={publishState.error} />
      )}
      <div className="sticky bottom-0 flex justify-end gap-2 border-t border-[var(--ar-border)] bg-[var(--ar-bg)] py-3">
        <Button onClick={() => router.push("/templates")}>{common("actions.cancel")}</Button>
        {isNew ? (
          <Button busy={createState.busy} icon={<Save aria-hidden="true" className="size-4" />} onClick={() => void create({ ...meta, items, accessories })} size="primary" variant="primary">
            {t("actions.create")}
          </Button>
        ) : (
          <Button busy={publishState.busy} disabled={archived} icon={<Send aria-hidden="true" className="size-4" />} onClick={() => void publish(false, version)} size="primary" variant="primary">
            {t("actions.publish")}
          </Button>
        )}
      </div>
      <Dialog
        closeLabel={common("actions.close")}
        description={t("inUseDialog.body")}
        footer={
          <>
            <Button onClick={() => { setInUseConfirm(null); publishState.reset(); }}>{common("actions.cancel")}</Button>
            <Button busy={publishState.busy} onClick={() => void publish(true, version)} variant="primary">
              {t("inUseDialog.confirm")}
            </Button>
          </>
        }
        onClose={() => { setInUseConfirm(null); publishState.reset(); }}
        open={inUseConfirm !== null}
        title={t("inUseDialog.title")}
      >
        <p>{t("inUse", { count: inUseConfirm ?? 0 })}</p>
      </Dialog>
      <ConfirmDialog
        body={t("delete.body")}
        confirmLabel={common("actions.delete")}
        errorAction={(error) => (isApiError(error, "RECORD_IN_USE") && !archived ? <Button onClick={() => { setDeleting(false); void saveMeta({ archived: true }, version); }}>{t("delete.archiveInstead")}</Button> : null)}
        onClose={() => setDeleting(false)}
        onConfirm={async () => {
          await api(`/checklist-templates/${id}`, { method: "DELETE" });
          toast.success(common("toast.deleted"));
          router.push("/templates");
        }}
        open={deleting}
        title={t("delete.title", { name: template?.name ?? "" })}
      />
    </div>
  );
}
