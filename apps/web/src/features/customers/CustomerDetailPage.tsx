"use client";

import type { CustomerDTO, SiteDTO } from "@agrorende/contracts/dto";
import { useQuery } from "@tanstack/react-query";
import { Archive, ArchiveRestore, MessageCircle, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { Card, Detail } from "@/components/data/Detail";
import { LoadingState } from "@/components/data/States";
import { ConfirmDialog } from "@/components/forms/ConfirmDialog";
import { FormDialog } from "@/components/forms/FormDialog";
import { ConflictActions } from "@/components/recovery/ConflictActions";
import { ErrorAlert } from "@/components/recovery/ErrorAlert";
import { PageHeader } from "@/components/shell/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { api, isApiError } from "@/lib/api";
import type { ListPage } from "@/lib/forms";
import { useSave } from "@/lib/useSave";

import { CustomerFields, customerBody, customerFormValues } from "./CustomerForm";

export function CustomerDetailPage({ id }: { readonly id: string }) {
  const t = useTranslations("assets");
  const common = useTranslations("common");
  const router = useRouter();
  const query = useQuery({ queryKey: ["customers", id], queryFn: () => api<CustomerDTO>(`/customers/${id}`) });
  const sites = useQuery({ queryKey: ["sites", { customerId: id }], queryFn: () => api<ListPage<SiteDTO>>("/sites", { query: { customerId: id, limit: 50 } }) });
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState(customerFormValues());
  const [deleting, setDeleting] = useState(false);
  const [save, saveState] = useSave("customers", (body: Record<string, unknown>, version: string) => api<CustomerDTO>(`/customers/${id}`, { method: "PATCH", body, version }), () => {
    setEditing(false);
    toast.success(common("toast.saved"));
  });
  const [archive, archiveState] = useSave("customers", (archived: boolean, version: string) => api<CustomerDTO>(`/customers/${id}`, { method: "PATCH", body: { archived }, version }), () => toast.success(common("toast.saved")));

  if (query.isLoading) return <LoadingState />;
  if (query.error !== null || query.data === undefined) return <ErrorAlert error={query.error} onRetry={() => void query.refetch()} />;
  const c = query.data;
  const archived = c.archivedAt !== null && c.archivedAt !== undefined;
  const initial = customerFormValues(c);
  const whatsappDigits = (c.whatsapp ?? "").replace(/\D/gu, "");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={
          <>
            <Button icon={<Pencil aria-hidden="true" className="size-4" />} onClick={() => { setValues(initial); saveState.reset(); setEditing(true); }}>
              {common("actions.edit")}
            </Button>
            <Button busy={archiveState.busy} icon={archived ? <ArchiveRestore aria-hidden="true" className="size-4" /> : <Archive aria-hidden="true" className="size-4" />} onClick={() => void archive(!archived, c.syncVersion)}>
              {archived ? common("actions.unarchive") : common("actions.archive")}
            </Button>
            <Button icon={<Trash2 aria-hidden="true" className="size-4" />} onClick={() => setDeleting(true)} variant="danger">
              {common("actions.delete")}
            </Button>
          </>
        }
        back={{ href: "/customers", label: t("customers.list.title") }}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {c.tradeName}
            {c.isSupplier ? <Badge tone="info">{t("customers.supplier")}</Badge> : null}
            {archived ? <Badge tone="neutral">{common("states.archived")}</Badge> : null}
          </span>
        }
        title={c.name}
      />
      {archiveState.error === null ? null : <ErrorAlert error={archiveState.error} onRetry={() => void query.refetch()} />}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2" title={t("detail.info")}>
          <dl className="grid gap-4 sm:grid-cols-2">
            <Detail label={t("customers.fields.taxId")} value={c.taxIdMasked === null || c.taxIdMasked === undefined ? null : <span className="font-mono">{c.taxIdMasked}</span>} />
            <Detail label={t("customers.fields.email")} value={c.email} />
            <Detail label={t("customers.fields.phone")} value={c.phone} />
            <Detail
              label={t("customers.fields.whatsapp")}
              value={
                whatsappDigits.length === 0 ? null : (
                  <a className="inline-flex min-h-12 items-center gap-2 text-[var(--ar-link)]" href={`https://wa.me/${whatsappDigits}`} rel="noreferrer" target="_blank">
                    <MessageCircle aria-hidden="true" className="size-4" />
                    {c.whatsapp}
                  </a>
                )
              }
            />
            <Detail label={t("customers.fields.address")} value={c.address} />
            <Detail label={t("customers.fields.city")} value={[c.city, c.state].filter(Boolean).join(" · ")} />
          </dl>
          {c.notes === null || c.notes === undefined ? null : <p className="mt-4 whitespace-pre-wrap">{c.notes}</p>}
        </Card>
        <Card title={t("customers.detail.sites")}>
          {sites.error === null ? null : <ErrorAlert compact error={sites.error} onRetry={() => void sites.refetch()} />}
          {sites.data !== undefined && sites.data.items.length === 0 ? <p className="text-[var(--ar-text-muted)]">{t("customers.detail.noSites")}</p> : null}
          <ul className="flex flex-col">
            {(sites.data?.items ?? []).map((s) => (
              <li key={s.id}>
                <Link className="flex min-h-12 items-center font-semibold text-[var(--ar-link)]" href={`/sites/${s.id}`}>
                  {s.name}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <FormDialog
        busy={saveState.busy}
        dirty
        error={saveState.error}
        errorAction={saveState.conflict ? <ConflictActions onKeepMine={() => void query.refetch().then((r) => (r.data === undefined ? undefined : save(customerBody(values, initial), r.data.syncVersion)))} onUseTheirs={() => { setEditing(false); void query.refetch(); }} /> : undefined}
        formId="customer-edit"
        onClose={() => setEditing(false)}
        onSubmit={() => void save(customerBody(values, initial), c.syncVersion)}
        open={editing}
        size="lg"
        title={t("customers.edit.title")}
      >
        <CustomerFields error={saveState.error} onChange={setValues} values={values} />
      </FormDialog>
      <ConfirmDialog
        body={t("customers.delete.body")}
        confirmLabel={common("actions.delete")}
        errorAction={(error) =>
          isApiError(error) && error.code === "RECORD_IN_USE" && !archived ? (
            <Button onClick={() => { setDeleting(false); void archive(true, c.syncVersion); }}>{t("sites.delete.archiveInstead")}</Button>
          ) : null
        }
        onClose={() => setDeleting(false)}
        onConfirm={async () => {
          await api(`/customers/${id}`, { method: "DELETE" });
          toast.success(common("toast.deleted"));
          router.push("/customers");
        }}
        open={deleting}
        title={t("customers.delete.title", { name: c.name })}
      />
    </div>
  );
}
