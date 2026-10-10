import { displayPhone, mailtoHref, siteConfig, whatsappHref } from "@/lib/config";
import { type SiteLocale } from "@/lib/locales";
import { errorCopy, getTranslator } from "@/i18n/messages";

import { ContactActions } from "./ContactActions";

/** Server wrapper that resolves the copy and public contact details for <ContactActions>. */
export function Contact({
  locale,
  className,
  tone = "default",
  channels = "both",
  variant = "secondary",
  whatsappLabel,
}: {
  readonly locale: SiteLocale;
  readonly className?: string;
  readonly tone?: "default" | "onDark";
  readonly channels?: "whatsapp" | "both";
  readonly variant?: "secondary" | "primary";
  /** Replaces "Falar no WhatsApp", for example with "Pedir uma proposta". */
  readonly whatsappLabel?: string;
}) {
  const t = getTranslator(locale);
  const whatsapp = errorCopy(locale, "WHATSAPP_UNAVAILABLE");
  const mail = errorCopy(locale, "MAIL_CLIENT_UNAVAILABLE");
  const message = t("cta.whatsappText");
  const subject = t("cta.emailSubject");
  return (
    <ContactActions
      className={className}
      tone={tone}
      channels={channels}
      variant={variant}
      whatsappHref={whatsappHref(siteConfig.whatsappNumber, message)}
      mailtoHref={mailtoHref(siteConfig.contactEmail, subject, t("cta.emailBody"))}
      phone={displayPhone(siteConfig.whatsappNumber)}
      email={siteConfig.contactEmail}
      subject={subject}
      message={message}
      labels={{
        whatsapp: whatsappLabel ?? t("cta.whatsapp"),
        email: t("cta.email"),
        phoneLabel: t("contact.phoneLabel"),
        emailLabel: t("contact.emailLabel"),
        subjectLabel: t("contact.subjectLabel"),
        messageLabel: t("contact.messageLabel"),
        copy: t("contact.copy"),
        copied: t("contact.copied"),
        copyFailed: t("contact.copyFailed"),
        close: t("contact.close"),
        openAgain: t("contact.openAgain"),
        privacyNote: t("contact.privacyNote"),
        whatsappTitle: whatsapp?.title ?? "",
        whatsappBody: whatsapp?.body ?? "",
        emailTitle: mail?.title ?? "",
        emailBody: mail?.body ?? "",
      }}
    />
  );
}
