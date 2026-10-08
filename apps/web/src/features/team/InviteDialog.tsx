"use client";

import type { Role } from "@agrorende/contracts/enums";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { FormDialog } from "@/components/forms/FormDialog";
import { Dialog } from "@/components/ui/Dialog";
import { Field, Input, Select } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api";
import { useFieldErrors } from "@/lib/forms";
import { useSave } from "@/lib/useSave";

import { SharePanel } from "./SharePanel";
import { type CreateUserResult, ROLES } from "./types";

const empty = { name: "", email: "", phone: "", role: "FIELD" as Role };

export function InviteDialog({ open, onClose }: { readonly open: boolean; readonly onClose: () => void }) {
  const t = useTranslations("team");
  const admin = useTranslations("admin");
  const common = useTranslations("common");
  const [values, setValues] = useState(empty);
  const [result, setResult] = useState<CreateUserResult | null>(null);
  const [invite, state] = useSave("users", (body: Record<string, unknown>) => api<CreateUserResult>("/users", { method: "POST", body }), setResult);
  const fe = useFieldErrors()(state.error);
  const close = () => {
    setValues(empty);
    setResult(null);
    state.reset();
    onClose();
  };
  if (result !== null) {
    return (
      <Dialog closeLabel={common("actions.close")} footer={<Button onClick={close} variant="primary">{common("actions.done")}</Button>} onClose={close} open={open} title={t("invite.sentTitle")}>
        <SharePanel kind="invite" link={result.invite} name={result.user.name} phone={values.phone} />
      </Dialog>
    );
  }
  const body = {
    name: values.name.trim(),
    role: values.role,
    ...(values.email.trim().length > 0 ? { email: values.email.trim().toLowerCase() } : {}),
    ...(values.phone.trim().length > 0 ? { phone: values.phone.trim() } : {}),
  };
  return (
    <FormDialog busy={state.busy} dirty={JSON.stringify(values) !== JSON.stringify(empty)} error={state.error} formId="team-invite" onClose={close} onSubmit={() => void invite(body)} open={open} submitLabel={t("invite.submit")} title={t("invite.title")}>
      <Field error={fe.name} label={t("fields.name")} required>
        {(p) => <Input {...p} autoComplete="off" onChange={(e) => setValues({ ...values, name: e.target.value })} value={values.name} />}
      </Field>
      <Field error={fe.role} hint={t(`roleHint.${values.role}`)} label={t("fields.role")} required>
        {(p) => (
          <Select {...p} onChange={(e) => setValues({ ...values, role: e.target.value as Role })} value={values.role}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {admin(`roles.${r}`)}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field error={fe.email} hint={t("invite.emailHint")} label={t("fields.email")}>
        {(p) => <Input {...p} autoComplete="off" inputMode="email" onChange={(e) => setValues({ ...values, email: e.target.value })} type="email" value={values.email} />}
      </Field>
      <Field error={fe.phone} hint={t("invite.phoneHint")} label={t("fields.phone")}>
        {(p) => <Input {...p} autoComplete="off" inputMode="tel" onChange={(e) => setValues({ ...values, phone: e.target.value })} type="tel" value={values.phone} />}
      </Field>
    </FormDialog>
  );
}
