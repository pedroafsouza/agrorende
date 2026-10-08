"use client";

import { OrgStatusEnum, type OrgStatus } from "@agrorende/contracts/enums";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, KeyRound, Save } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import type { PlatformAdminDTO, PlatformOrgDetailDTO } from "@agrorende/core/modules/tenancy/dto";

import { LoadingState } from "@/components/data/States";
import { ErrorAlert } from "@/components/recovery/ErrorAlert";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { formatBytes } from "@/features/subscription/window";
import { OrgStatusBadge } from "@/features/tenancy/OrgStatusBadge";
import { formatDay } from "@/features/tenancy/TenancyOrgBanner";
import { ApiError } from "@/lib/api";

import { platformApi } from "./platformApi";

interface ResetLink {
  readonly url: string;
  readonly whatsappUrl: string;
  readonly expiresAt: string;
}

export interface PatchValues {
  readonly status: OrgStatus;
  readonly plan: string;
  readonly trialEndsAt: string;
  readonly reason: string;
}

/** Only the fields that changed are sent; the reason is always required (TEN-06). */
export function patchBody(org: Pick<PlatformOrgDetailDTO, "status" | "plan" | "trialEndsAt">, values: PatchValues): Record<string, string> | null {
  const body: Record<string, string> = {};
  if (values.status !== org.status) body.status = values.status;
  if (values.plan.trim().length > 0 && values.plan.trim() !== org.plan) body.plan = values.plan.trim();
  const currentDay = org.trialEndsAt === null ? "" : org.trialEndsAt.slice(0, 10);
  if (values.trialEndsAt.length > 0 && values.trialEndsAt !== currentDay) body.trialEndsAt = new Date(`${values.trialEndsAt}T23:59:59.000Z`).toISOString();
  if (Object.keys(body).length === 0) return null;
  return { ...body, reason: values.reason.trim() };
}

function EditForm({ org }: { readonly org: PlatformOrgDetailDTO }) {
  const t = useTranslations("platform");
  const tenancy = useTranslations("tenancy");
  const client = useQueryClient();
  const [values, setValues] = useState<PatchValues>({ status: org.status, plan: org.plan, trialEndsAt: org.trialEndsAt === null ? "" : org.trialEndsAt.slice(0, 10), reason: "" });
  const body = patchBody(org, values);
  const mutation = useMutation({
    mutationFn: () => platformApi<PlatformOrgDetailDTO>(`/orgs/${org.id}`, { method: "PATCH", body }),
    onSuccess: (next) => {
      client.setQueryData(["platform", "org", org.id], next);
      void client.invalidateQueries({ queryKey: ["platform", "orgs"] });
      setValues((current) => ({ ...current, reason: "" }));
      toast.success(t("detail.edit.saved"));
    },
  });
  const reasonError = mutation.error instanceof ApiError && mutation.error.fieldErrors.some((fe) => fe.path === "reason") ? t("detail.edit.reasonRequired") : undefined;
  return (
    <form
      aria-labelledby="edit-title"
      className="flex flex-col gap-4 rounded-cards border border-[var(--ar-border)] bg-[var(--ar-surface)] p-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate();
      }}
    >
      <h2 className="text-lg font-semibold" id="edit-title">
        {t("detail.edit.title")}
      </h2>
      {mutation.error !== null && reasonError === undefined ? <ErrorAlert error={mutation.error} /> : null}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t("detail.edit.status")}>
          {(p) => (
            <Select {...p} name="status" onChange={(e) => setValues((v) => ({ ...v, status: OrgStatusEnum.parse(e.target.value) }))} value={values.status}>
              {OrgStatusEnum.options.map((value) => (
                <option key={value} value={value}>
                  {tenancy(`status.${value}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t("detail.edit.plan")}>
          {(p) => <Input {...p} maxLength={40} name="plan" onChange={(e) => setValues((v) => ({ ...v, plan: e.target.value }))} value={values.plan} />}
        </Field>
        <Field hint={t("detail.edit.trialHint")} label={t("detail.edit.trialEndsAt")}>
          {(p) => <Input {...p} name="trialEndsAt" onChange={(e) => setValues((v) => ({ ...v, trialEndsAt: e.target.value }))} type="date" value={values.trialEndsAt} />}
        </Field>
      </div>
      <Field error={reasonError} hint={t("detail.edit.reasonHint")} label={t("detail.edit.reason")} required>
        {(p) => <Textarea {...p} maxLength={500} name="reason" onChange={(e) => setValues((v) => ({ ...v, reason: e.target.value }))} value={values.reason} />}
      </Field>
      <Button busy={mutation.isPending} className="w-fit" disabled={body === null || values.reason.trim().length < 3} icon={<Save aria-hidden="true" className="size-5" />} type="submit" variant="primary">
        {t("detail.edit.submit")}
      </Button>
    </form>
  );
}

function ResetLinkDialog({ admin, orgId, onClose }: { readonly admin: PlatformAdminDTO | null; readonly orgId: string; readonly onClose: () => void }) {
  const t = useTranslations("platform");
  const common = useTranslations("common");
  const locale = useLocale();
  const client = useQueryClient();
  const [reason, setReason] = useState("");
  const mutation = useMutation({
    mutationFn: () => platformApi<ResetLink>(`/orgs/${orgId}/admin-reset-link`, { method: "POST", body: { userId: admin?.id, reason: reason.trim() } }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["platform", "org", orgId] }),
  });
  const close = () => {
    setReason("");
    mutation.reset();
    onClose();
  };
  const link = mutation.data;
  return (
    <Dialog
      closeLabel={common("actions.close")}
      description={admin === null ? undefined : t("detail.reset.description", { name: admin.name })}
      dismissible={!mutation.isPending}
      footer={
        link === undefined ? (
          <Button busy={mutation.isPending} disabled={reason.trim().length < 3} icon={<KeyRound aria-hidden="true" className="size-5" />} onClick={() => mutation.mutate()} variant="primary">
            {t("detail.reset.create")}
          </Button>
        ) : (
          <Button onClick={close}>{common("actions.close")}</Button>
        )
      }
      onClose={close}
      open={admin !== null}
      title={t("detail.reset.title")}
    >
      {link === undefined ? (
        <div className="flex flex-col gap-4">
          {mutation.error === null ? null : <ErrorAlert error={mutation.error} />}
          <Field hint={t("detail.reset.reasonHint")} label={t("detail.edit.reason")} required>
            {(p) => <Textarea {...p} maxLength={500} name="reason" onChange={(e) => setReason(e.target.value)} value={reason} />}
          </Field>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm">{t("detail.reset.ready", { date: formatDay(link.expiresAt, locale, undefined) })}</p>
          <code className="break-all rounded-controls border border-[var(--ar-border)] bg-[var(--ar-surface-muted)] p-3 text-sm">{link.url}</code>
          <Button
            className="w-fit"
            icon={<Copy aria-hidden="true" className="size-5" />}
            onClick={() => {
              void navigator.clipboard?.writeText(link.url).then(() => toast.success(t("detail.reset.copied")));
            }}
          >
            {t("detail.reset.copy")}
          </Button>
        </div>
      )}
    </Dialog>
  );
}

export function PlatformOrgDetailView({ org }: { readonly org: PlatformOrgDetailDTO }) {
  const t = useTranslations("platform");
  const locale = useLocale();
  const number = new Intl.NumberFormat(locale);
  const monthFormat = new Intl.DateTimeFormat(locale, { month: "short", year: "numeric", timeZone: "UTC" });
  const dateTime = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  const [resetFor, setResetFor] = useState<PlatformAdminDTO | null>(null);
  const facts: [string, string][] = [
    [t("detail.facts.plan"), org.plan],
    [t("detail.facts.createdAt"), formatDay(org.createdAt, locale, undefined)],
    [t("detail.facts.trialEndsAt"), org.trialEndsAt === null ? "—" : formatDay(org.trialEndsAt, locale, undefined)],
    [t("detail.facts.purgeAfter"), org.purgeAfter === null ? "—" : formatDay(org.purgeAfter, locale, undefined)],
    [t("detail.facts.timezone"), org.timezone],
    [t("detail.facts.locale"), org.locale],
    [t("detail.facts.officePhone"), org.officePhone ?? "—"],
    [t("detail.facts.expectedFieldUsers"), org.expectedFieldUsers ?? "—"],
    [t("detail.facts.signupSource"), org.signupSource ?? "—"],
    [t("detail.facts.terms"), org.termsVersion === null ? "—" : `${org.termsVersion}${org.termsAcceptedAt === null ? "" : ` (${formatDay(org.termsAcceptedAt, locale, undefined)})`}`],
  ];
  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <PageHeader actions={<OrgStatusBadge status={org.status} />} back={{ href: "/platform/orgs", label: t("detail.back") }} subtitle={org.id} title={org.name} />
      <dl className="grid gap-x-6 gap-y-2 rounded-cards border border-[var(--ar-border)] bg-[var(--ar-surface)] p-4 text-sm sm:grid-cols-2">
        {facts.map(([label, value]) => (
          <div className="flex justify-between gap-4 border-b border-[var(--ar-border)] py-2 last:border-b-0" key={label}>
            <dt className="text-[var(--ar-text-muted)]">{label}</dt>
            <dd className="text-right font-semibold">{value}</dd>
          </div>
        ))}
      </dl>

      <EditForm key={`${org.status}-${org.plan}-${org.trialEndsAt ?? ""}`} org={org} />

      <section aria-labelledby="usage-title" className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold" id="usage-title">
          {t("detail.usage.title")}
        </h2>
        {org.usage.length === 0 ? (
          <p className="text-sm text-[var(--ar-text-muted)]">{t("detail.usage.empty")}</p>
        ) : (
          <div className="overflow-x-auto rounded-cards border border-[var(--ar-border)]">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead className="bg-[var(--ar-surface-muted)]">
                <tr>
                  <th className="px-3 py-3" scope="col">{t("detail.usage.month")}</th>
                  <th className="px-3 py-3 text-right" scope="col">{t("detail.usage.activeFieldUsers")}</th>
                  <th className="px-3 py-3 text-right" scope="col">{t("detail.usage.officeUsers")}</th>
                  <th className="px-3 py-3 text-right" scope="col">{t("detail.usage.assetCount")}</th>
                  <th className="px-3 py-3 text-right" scope="col">{t("detail.usage.storage")}</th>
                </tr>
              </thead>
              <tbody>
                {org.usage.map((row) => (
                  <tr className="border-t border-[var(--ar-border)]" key={row.month}>
                    <th className="px-3 py-3 font-semibold capitalize" scope="row">{monthFormat.format(new Date(`${row.month}T00:00:00Z`))}</th>
                    <td className="px-3 py-3 text-right tabular-nums">{number.format(row.activeFieldUsers)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{number.format(row.officeUsers)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{number.format(row.assetCount)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{formatBytes(row.storageBytes, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="admins-title" className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold" id="admins-title">
          {t("detail.admins.title")}
        </h2>
        <ul className="flex flex-col divide-y divide-[var(--ar-border)] rounded-cards border border-[var(--ar-border)] bg-[var(--ar-surface)]">
          {org.admins.map((admin) => (
            <li className="flex flex-wrap items-center gap-3 p-3" key={admin.id}>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{admin.name}</p>
                <p className="text-sm text-[var(--ar-text-muted)]">{admin.email ?? t("detail.admins.noEmail")}</p>
              </div>
              {admin.isActive ? null : <span className="text-sm">{t("detail.admins.inactive")}</span>}
              <Button icon={<KeyRound aria-hidden="true" className="size-5" />} onClick={() => setResetFor(admin)}>
                {t("detail.admins.resetLink")}
              </Button>
            </li>
          ))}
        </ul>
        <ResetLinkDialog admin={resetFor} onClose={() => setResetFor(null)} orgId={org.id} />
      </section>

      <section aria-labelledby="audit-title" className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold" id="audit-title">
          {t("detail.audit.title")}
        </h2>
        {org.audit.length === 0 ? (
          <p className="text-sm text-[var(--ar-text-muted)]">{t("detail.audit.empty")}</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {org.audit.map((row) => (
              <li className="rounded-cards border border-[var(--ar-border)] bg-[var(--ar-surface)] p-3 text-sm" key={row.id}>
                <p className="flex flex-wrap gap-x-3 font-semibold">
                  <span>{t.has(`detail.audit.actions.${row.action}`) ? t(`detail.audit.actions.${row.action}`) : row.action}</span>
                  <time className="font-normal text-[var(--ar-text-muted)]" dateTime={row.createdAt}>
                    {dateTime.format(new Date(row.createdAt))}
                  </time>
                </p>
                <p className="text-[var(--ar-text-muted)]">{row.actorEmail}</p>
                {row.reason === null ? null : <p className="mt-1">{row.reason}</p>}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

/** `/platform/orgs/[id]`: metadata, usage, status/plan/trial edits with a reason, admin reset links and the audit list. */
export function PlatformOrgDetailPage({ id }: { readonly id: string }) {
  const query = useQuery({ queryKey: ["platform", "org", id], queryFn: () => platformApi<PlatformOrgDetailDTO>(`/orgs/${id}`) });
  if (query.isLoading) return <LoadingState rows={8} />;
  if (query.error !== null) return <ErrorAlert error={query.error} onRetry={() => void query.refetch()} />;
  if (query.data === undefined) return null;
  return <PlatformOrgDetailView org={query.data} />;
}
