"use client";

import type { IssueCategory, Role } from "@agrorende/contracts/enums";
import { useQuery } from "@tanstack/react-query";
import { KeyRound, Link2, MailPlus, Pencil, ShieldCheck, UserCheck, UserX } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { Card, Detail } from "@/components/data/Detail";
import { EmptyState, LoadingState } from "@/components/data/States";
import { ConfirmDialog } from "@/components/forms/ConfirmDialog";
import { FormDialog } from "@/components/forms/FormDialog";
import { MoneyInput } from "@/components/forms/MoneyInput";
import { ErrorAlert } from "@/components/recovery/ErrorAlert";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Checkbox, Field, Input, Select } from "@/components/ui/Field";
import { api } from "@/lib/api";
import { formatDateTime, formatMoney } from "@/lib/format";
import { useFieldErrors } from "@/lib/forms";
import { useSave } from "@/lib/useSave";
import { MIN_PASSWORD } from "@/features/shell/auth/PasswordField";

import { DeviceCard } from "./DeviceHealth";
import { SharePanel } from "./SharePanel";
import { UserStateChip } from "./UserChips";
import { type InviteLink, ROLES, SKILLS, type TeamDevice, type TeamUser, userState } from "./types";

interface EditValues {
  readonly name: string;
  readonly phone: string;
  readonly skills: readonly IssueCategory[];
  readonly hourlyCostCents: number | null;
}

const editValues = (u: TeamUser): EditValues => ({ name: u.name, phone: u.phone ?? "", skills: u.skills, hourlyCostCents: u.hourlyCostCents ?? null });

export function UserDetailPage({ id }: { readonly id: string }) {
  const t = useTranslations("team");
  const admin = useTranslations("admin");
  const common = useTranslations("common");
  const locale = useLocale();
  const query = useQuery({ queryKey: ["users", id], queryFn: () => api<TeamUser>(`/users/${id}`) });
  const devices = useQuery({ queryKey: ["users", id, "devices"], queryFn: () => api<{ items: TeamDevice[] }>(`/users/${id}/devices`) });
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<EditValues | null>(null);
  const [roleOpen, setRoleOpen] = useState(false);
  const [role, setRole] = useState<Role>("FIELD");
  const [tempOpen, setTempOpen] = useState(false);
  const [tempPassword, setTempPassword] = useState("");
  const [deactivating, setDeactivating] = useState(false);
  const [share, setShare] = useState<{ kind: "invite" | "reset"; link: InviteLink } | null>(null);

  const [save, saveState] = useSave("users", (body: Record<string, unknown>, version: string) => api<TeamUser>(`/users/${id}`, { method: "PATCH", body, version }), () => {
    setEditing(false);
    toast.success(common("toast.saved"));
  });
  const [changeRole, roleState] = useSave("users", (next: Role) => api<TeamUser>(`/users/${id}/role`, { method: "POST", body: { role: next } }), () => {
    setRoleOpen(false);
    toast.success(common("toast.saved"));
  });
  const [resend, resendState] = useSave("users", () => api<InviteLink>(`/users/${id}/invite`, { method: "POST" }), (link) => setShare({ kind: "invite", link }));
  const [resetLink, resetState] = useSave("users", () => api<InviteLink>(`/users/${id}/reset-link`, { method: "POST" }), (link) => setShare({ kind: "reset", link }));
  const [setTemp, tempState] = useSave("users", (password: string) => api(`/users/${id}/temporary-password`, { method: "POST", body: { password } }), () => {
    setTempOpen(false);
    setTempPassword("");
    toast.success(t("temporary.done"));
  });
  const [reactivate, reactivateState] = useSave("users", () => api<TeamUser>(`/users/${id}/reactivate`, { method: "POST" }), () => toast.success(common("toast.saved")));
  const fe = useFieldErrors()(saveState.error);

  if (query.isLoading) return <LoadingState />;
  if (query.error !== null || query.data === undefined) return <ErrorAlert error={query.error} onRetry={() => void query.refetch()} />;
  const user = query.data;
  const state = userState(user);
  const actionError = roleState.error ?? resendState.error ?? resetState.error ?? reactivateState.error;
  const edit = values ?? editValues(user);
  const tempTooShort = tempPassword.length > 0 && tempPassword.length < MIN_PASSWORD;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={
          <>
            <Button icon={<Pencil aria-hidden="true" className="size-4" />} onClick={() => { setValues(editValues(user)); saveState.reset(); setEditing(true); }}>
              {common("actions.edit")}
            </Button>
            <Button icon={<ShieldCheck aria-hidden="true" className="size-4" />} onClick={() => { setRole(user.role); roleState.reset(); setRoleOpen(true); }}>
              {t("actions.changeRole")}
            </Button>
            {state === "INVITED" ? (
              <Button busy={resendState.busy} icon={<MailPlus aria-hidden="true" className="size-4" />} onClick={() => void resend()}>
                {t("actions.resendInvite")}
              </Button>
            ) : null}
            {state === "DISABLED" ? (
              <Button busy={reactivateState.busy} icon={<UserCheck aria-hidden="true" className="size-4" />} onClick={() => void reactivate()}>
                {t("actions.reactivate")}
              </Button>
            ) : (
              <>
                <Button busy={resetState.busy} icon={<Link2 aria-hidden="true" className="size-4" />} onClick={() => void resetLink()}>
                  {t("actions.resetLink")}
                </Button>
                <Button icon={<KeyRound aria-hidden="true" className="size-4" />} onClick={() => { tempState.reset(); setTempOpen(true); }}>
                  {t("actions.temporaryPassword")}
                </Button>
                <Button icon={<UserX aria-hidden="true" className="size-4" />} onClick={() => setDeactivating(true)} variant="danger">
                  {t("actions.deactivate")}
                </Button>
              </>
            )}
          </>
        }
        back={{ href: "/team", label: t("list.title") }}
        subtitle={admin(`roles.${user.role}`)}
        title={user.name}
      />
      {actionError === null ? null : <ErrorAlert error={actionError} />}
      {user.joinedWithOtherEmail === true ? (
        <p className="rounded-cards bg-[var(--ar-warning-bg)] p-3 text-[var(--ar-warning-text)]" role="status">
          {t("otherEmail.body", { invited: user.invitedEmail ?? "—", joined: user.email ?? "—" })}
        </p>
      ) : null}
      <Card title={t("detail.info")}>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Detail label={t("fields.state")} value={<UserStateChip user={user} />} />
          <Detail label={t("fields.email")} value={user.email} />
          <Detail label={t("fields.phone")} value={user.phone} />
          <Detail label={t("fields.skills")} value={user.skills.map((k) => t(`skill.${k}`)).join(", ")} />
          <Detail label={t("fields.hourlyCost")} value={user.hourlyCostCents === null || user.hourlyCostCents === undefined ? null : formatMoney(user.hourlyCostCents, locale)} />
          <Detail label={t("fields.joinedAt")} value={formatDateTime(user.joinedAt, locale)} />
          <Detail label={t("fields.lastSeenAt")} value={formatDateTime(user.lastSeenAt, locale)} />
          <Detail label={t("fields.duty")} value={t(`duty.${user.dutyStatus}`)} />
        </dl>
      </Card>
      <Card title={t("detail.devices")}>
        {devices.isLoading ? (
          <LoadingState rows={2} />
        ) : devices.error !== null ? (
          <ErrorAlert error={devices.error} onRetry={() => void devices.refetch()} />
        ) : (devices.data?.items.length ?? 0) === 0 ? (
          <EmptyState body={t("devices.noneForUser")} title={t("devices.emptyTitle")} />
        ) : (
          <div className="flex flex-col gap-3">
            {devices.data?.items.map((d) => <DeviceCard device={d} key={d.id} />)}
          </div>
        )}
      </Card>

      <FormDialog
        busy={saveState.busy}
        dirty={JSON.stringify(edit) !== JSON.stringify(editValues(user))}
        error={saveState.error}
        formId="user-edit"
        onClose={() => setEditing(false)}
        onSubmit={() => void save({ name: edit.name.trim(), phone: edit.phone.trim().length === 0 ? null : edit.phone.trim(), skills: edit.skills, hourlyCostCents: edit.hourlyCostCents }, user.syncVersion)}
        open={editing}
        submitLabel={common("actions.save")}
        title={t("edit.title")}
      >
        <Field error={fe.name} label={t("fields.name")} required>
          {(p) => <Input {...p} onChange={(e) => setValues({ ...edit, name: e.target.value })} value={edit.name} />}
        </Field>
        <Field error={fe.phone} label={t("fields.phone")}>
          {(p) => <Input {...p} inputMode="tel" onChange={(e) => setValues({ ...edit, phone: e.target.value })} type="tel" value={edit.phone} />}
        </Field>
        <Field error={fe.hourlyCostCents} hint={t("hints.hourlyCost")} label={t("fields.hourlyCost")}>
          {(p) => <MoneyInput {...p} cents={edit.hourlyCostCents} onChange={(cents) => setValues({ ...edit, hourlyCostCents: cents })} />}
        </Field>
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 font-semibold">{t("fields.skills")}</legend>
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {SKILLS.map((k) => (
              <Checkbox
                checked={edit.skills.includes(k)}
                key={k}
                label={t(`skill.${k}`)}
                onChange={(e) => setValues({ ...edit, skills: e.target.checked ? [...edit.skills, k] : edit.skills.filter((x) => x !== k) })}
              />
            ))}
          </div>
        </fieldset>
      </FormDialog>

      <FormDialog busy={roleState.busy} dirty={role !== user.role} error={roleState.error} formId="user-role" onClose={() => setRoleOpen(false)} onSubmit={() => void changeRole(role)} open={roleOpen} submitLabel={t("actions.changeRole")} title={t("role.title", { name: user.name })}>
        <Field hint={t(`roleHint.${role}`)} label={t("fields.role")}>
          {(p) => (
            <Select {...p} onChange={(e) => setRole(e.target.value as Role)} value={role}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {admin(`roles.${r}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <p className="text-sm text-[var(--ar-text-muted)]">{t("role.body")}</p>
      </FormDialog>

      <FormDialog busy={tempState.busy} dirty={tempPassword.length > 0} error={tempState.error} formId="user-temp" onClose={() => setTempOpen(false)} onSubmit={() => { if (!tempTooShort && tempPassword.length > 0) void setTemp(tempPassword); }} open={tempOpen} submitLabel={t("temporary.submit")} title={t("temporary.title", { name: user.name })}>
        <p>{t("temporary.body")}</p>
        <Field error={tempTooShort ? t("temporary.tooShort", { min: MIN_PASSWORD }) : undefined} label={t("temporary.password")} required>
          {(p) => <Input {...p} autoComplete="off" className="font-mono" onChange={(e) => setTempPassword(e.target.value)} value={tempPassword} />}
        </Field>
      </FormDialog>

      <ConfirmDialog
        body={t("deactivate.body")}
        confirmLabel={t("actions.deactivate")}
        onClose={() => setDeactivating(false)}
        onConfirm={async () => {
          await api(`/users/${id}/deactivate`, { method: "POST" });
          await query.refetch();
          toast.success(common("toast.saved"));
        }}
        open={deactivating}
        title={t("deactivate.title", { name: user.name })}
      />

      <Dialog closeLabel={common("actions.close")} footer={<Button onClick={() => setShare(null)} variant="primary">{common("actions.done")}</Button>} onClose={() => setShare(null)} open={share !== null} title={share?.kind === "reset" ? t("share.resetTitle") : t("invite.sentTitle")}>
        {share === null ? null : <SharePanel kind={share.kind} link={share.link} name={user.name} phone={user.phone} />}
      </Dialog>
    </div>
  );
}
