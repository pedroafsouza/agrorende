"use client";

import { buildMailtoUrl, buildWhatsAppUrl, type ProviderInviteIssuedDTO } from "@agrorende/contracts";
import { Copy, Link2, Mail, MessageCircle } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, type FormEvent, type ReactElement } from "react";
import { toast } from "sonner";

import { FormDialog } from "@/components/forms/FormDialog";
import { Button, buttonVariants } from "@/components/ui/Button";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useSave } from "@/lib/useSave";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

interface InviteForm {
  readonly providerName: string;
  readonly phone: string;
  readonly email: string;
  readonly message: string;
}

const EMPTY: InviteForm = { providerName: "", phone: "", email: "", message: "" };

function validate(form: InviteForm): Partial<Record<keyof InviteForm | "contact", string>> {
  const errors: Partial<Record<keyof InviteForm | "contact", string>> = {};
  if (form.providerName.trim().length === 0) errors.providerName = "nameRequired";
  const digits = form.phone.replace(/\D/gu, "");
  if (digits.length === 0 && form.email.trim().length === 0) errors.contact = "contactRequired";
  if (digits.length > 0 && (digits.length < 10 || digits.length > 15)) errors.phone = "phoneInvalid";
  if (form.email.trim().length > 0 && !EMAIL.test(form.email.trim())) errors.email = "emailInvalid";
  return errors;
}

/** "Convidar de fora": name plus WhatsApp and/or email, and an optional message (#63). */
export function InviteDialog({ workOrderId, open, onClose, onIssued }: { readonly workOrderId: string; readonly open: boolean; readonly onClose: () => void; readonly onIssued: (issued: ProviderInviteIssuedDTO) => void }): ReactElement {
  const t = useTranslations("providers.form");
  const [form, setForm] = useState<InviteForm>(EMPTY);
  const [submitted, setSubmitted] = useState(false);
  const [save, state] = useSave("work-orders", (body: Record<string, string | null>) => api<ProviderInviteIssuedDTO>(`/work-orders/${workOrderId}/provider-invites`, { method: "POST", body }), (issued) => {
    setForm(EMPTY);
    setSubmitted(false);
    onIssued(issued);
  });
  const errors = submitted ? validate(form) : {};
  const message = (key: string | undefined) => (key === undefined ? undefined : t(`errors.${key}`));
  const set = (key: keyof InviteForm) => (event: FormEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [key]: event.currentTarget.value });
  const submit = () => {
    setSubmitted(true);
    if (Object.keys(validate(form)).length > 0) return;
    const phone = form.phone.replace(/\D/gu, "");
    void save({ providerName: form.providerName.trim(), phone: phone.length === 0 ? null : phone, email: form.email.trim().length === 0 ? null : form.email.trim(), message: form.message.trim().length === 0 ? null : form.message.trim() });
  };
  const close = () => {
    state.reset();
    setSubmitted(false);
    onClose();
  };
  return (
    <FormDialog busy={state.busy} dirty={form !== EMPTY} error={state.error} formId="provider-invite-form" onClose={close} onSubmit={submit} open={open} submitLabel={t("submit")} title={t("title")}>
      <Field error={message(errors.providerName)} label={t("name")} required>
        {(props) => <Input {...props} autoComplete="off" maxLength={120} onChange={set("providerName")} value={form.providerName} />}
      </Field>
      <p className="text-sm text-[var(--ar-text-muted)]">{t("contactHint")}</p>
      <Field error={message(errors.phone ?? errors.contact)} hint={t("phoneHint")} label={t("phone")}>
        {(props) => <Input {...props} autoComplete="off" inputMode="tel" maxLength={25} onChange={set("phone")} type="tel" value={form.phone} />}
      </Field>
      <Field error={message(errors.email ?? errors.contact)} label={t("email")}>
        {(props) => <Input {...props} autoComplete="off" inputMode="email" maxLength={200} onChange={set("email")} type="email" value={form.email} />}
      </Field>
      <Field label={t("message")}>
        {(props) => <Textarea {...props} className="min-h-24 py-2" maxLength={1000} onChange={set("message")} placeholder={t("messagePlaceholder")} value={form.message} />}
      </Field>
    </FormDialog>
  );
}

/** The plain link exists only in this response: copy it, or open WhatsApp / the mail app with it (#63). */
export function ShareCard({ issued, title, onClose }: { readonly issued: ProviderInviteIssuedDTO; readonly title: string; readonly onClose: () => void }): ReactElement {
  const t = useTranslations("providers.share");
  const toasts = useTranslations("providers.toast");
  const inviteText = useTranslations("providers.invite");
  const locale = useLocale();
  const { invite, link } = issued;
  const values = { name: invite.providerName, title, url: link.url, message: invite.message ?? "" };
  const text = invite.message === null ? t("whatsappText", values) : t("whatsappTextWithMessage", values);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link.url);
      toast.success(t("copied"));
    } catch {
      toast.error(toasts("copyFailed"));
    }
  };
  return (
    <section aria-live="polite" className="flex flex-col gap-3 rounded-cards border-2 border-[var(--ar-primary)] bg-[var(--ar-primary-bg)] p-4">
      <h3 className="flex items-center gap-2 font-semibold">
        <Link2 aria-hidden="true" className="size-5" />
        {t("title")}
      </h3>
      <p className="text-sm">{t("body")}</p>
      <Input aria-label={t("title")} className="font-mono text-sm" onFocus={(event) => event.currentTarget.select()} readOnly value={link.url} />
      <p className="text-sm text-[var(--ar-text-muted)]">{inviteText("expiresAt", { date: formatDateTime(link.expiresAt, locale) })}</p>
      <div className="flex flex-wrap gap-2">
        <Button icon={<Copy aria-hidden="true" className="size-4" />} onClick={() => void copy()}>
          {t("copy")}
        </Button>
        {invite.phone === null ? null : (
          <a className={buttonVariants({ variant: "primary" })} href={buildWhatsAppUrl(invite.phone, text)} rel="noopener noreferrer" target="_blank">
            <MessageCircle aria-hidden="true" className="size-4" />
            {t("whatsapp")}
          </a>
        )}
        {invite.email === null ? null : (
          <a className={buttonVariants({ variant: "secondary" })} href={buildMailtoUrl(invite.email, t("emailSubject", values), t("emailBody", values))}>
            <Mail aria-hidden="true" className="size-4" />
            {t("email")}
          </a>
        )}
        <Button onClick={onClose} variant="ghost">
          {t("close")}
        </Button>
      </div>
      {invite.email === null ? null : <p className="text-sm text-[var(--ar-text-muted)]">{t("emailQueued")}</p>}
    </section>
  );
}
