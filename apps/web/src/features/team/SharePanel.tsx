"use client";

import { Check, Copy, MessageCircle } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { Button, buttonVariants } from "@/components/ui/Button";
import { QrSvg } from "@/components/ui/QrSvg";
import { formatDateTime } from "@/lib/format";

import type { InviteLink } from "./types";

/** WhatsApp deep link with the localized message when the server did not return one. */
export function whatsappShareUrl(link: InviteLink, message: string, phone?: string | null): string {
  if (link.whatsappUrl !== undefined && link.whatsappUrl.length > 0) return link.whatsappUrl;
  const digits = (phone ?? "").replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

/** Share an invite or reset link: WhatsApp, copy and a large code for reading aloud or scanning. */
export function SharePanel({ link, kind, name, phone }: { readonly link: InviteLink; readonly kind: "invite" | "reset"; readonly name: string; readonly phone?: string | null }) {
  const t = useTranslations("team");
  const locale = useLocale();
  const [copied, setCopied] = useState(false);
  const message = t(`share.${kind}Message`, { name, url: link.url });
  const copy = async () => {
    await navigator.clipboard.writeText(link.url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="flex flex-col gap-3" data-testid="share-panel">
      <p>{t(`share.${kind}Body`, { name })}</p>
      <div className="break-all rounded-controls border border-[var(--ar-border)] bg-[var(--ar-surface-muted)] p-3 font-mono text-sm" data-testid="share-url">
        {link.url}
      </div>
      <div className="flex flex-wrap gap-2">
        <a className={buttonVariants({ variant: "primary" })} data-testid="share-whatsapp" href={whatsappShareUrl(link, message, phone)} rel="noreferrer" target="_blank">
          <MessageCircle aria-hidden="true" className="size-5" />
          {t("share.whatsapp")}
        </a>
        <Button icon={copied ? <Check aria-hidden="true" className="size-5" /> : <Copy aria-hidden="true" className="size-5" />} onClick={() => void copy()} variant="secondary">
          {copied ? t("share.copied") : t("share.copy")}
        </Button>
      </div>
      <div className="flex flex-col items-center gap-1 rounded-cards border border-dashed border-[var(--ar-border)] p-4">
        <QrSvg label={t("share.qr")} value={link.url} />
        <span className="text-sm text-[var(--ar-text-muted)]">{t("share.code")}</span>
        <span className="font-mono text-3xl font-bold tracking-widest">{link.code}</span>
      </div>
      {link.expiresAt === undefined ? null : <p className="text-sm text-[var(--ar-text-muted)]">{t("share.expires", { at: formatDateTime(link.expiresAt, locale) })}</p>}
    </div>
  );
}
