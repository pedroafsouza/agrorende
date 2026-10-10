"use client";

import { Check, Copy, Mail, MessageCircle, X } from "lucide-react";
import { type MouseEvent, useEffect, useId, useRef, useState } from "react";

/** How long the page waits for the browser to hand off before offering the fallback panel. */
export const HANDOFF_TIMEOUT_MS = 2500;

export interface ContactLabels {
  readonly whatsapp: string;
  readonly email: string;
  readonly phoneLabel: string;
  readonly emailLabel: string;
  readonly subjectLabel: string;
  readonly messageLabel: string;
  readonly copy: string;
  readonly copied: string;
  readonly copyFailed: string;
  readonly close: string;
  readonly openAgain: string;
  readonly privacyNote: string;
  readonly whatsappTitle: string;
  readonly whatsappBody: string;
  readonly emailTitle: string;
  readonly emailBody: string;
}

export interface ContactActionsProps {
  readonly labels: ContactLabels;
  readonly whatsappHref: string;
  readonly mailtoHref: string;
  readonly phone: string;
  readonly email: string;
  readonly subject: string;
  readonly message: string;
  readonly className?: string;
  /** `onDark` restyles the two main buttons for the dark hero and the final CTA band. */
  readonly tone?: "default" | "onDark";
  /** `whatsapp` shows only the WhatsApp button; e-mail stays in the fallback panel, the footer and help. */
  readonly channels?: "whatsapp" | "both";
  /** `primary` gives the WhatsApp button the filled action style, for "ask for a proposal". */
  readonly variant?: "secondary" | "primary";
}

type Channel = "whatsapp" | "email";

const actionBase =
  "motion-safe-transition inline-flex min-h-12 items-center justify-center gap-2 rounded-[8px] border-2 px-5 py-2 text-base font-semibold no-underline";
const actionClass = `${actionBase} border-border bg-bg text-fg hover:border-fg`;
const actionOnDark = `${actionBase} border-white/70 bg-transparent text-white hover:border-white hover:bg-white/10`;
const actionPrimary = `${actionBase} border-transparent bg-action text-action-fg hover:bg-action-hover`;

function CopyField({ label, value, labels }: { label: string; value: string; labels: ContactLabels }) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    try {
      if (navigator.clipboard === undefined) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch {
      input.current?.focus();
      input.current?.select();
      setState("failed");
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-fg-muted">
        {label}
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          ref={input}
          readOnly
          value={value}
          className="min-h-12 min-w-0 flex-1 rounded-[8px] border-2 border-border bg-bg px-3 font-mono text-base text-fg"
        />
        <button type="button" onClick={() => void copy()} className={actionClass}>
          {state === "copied" ? (
            <Check aria-hidden="true" className="size-5" />
          ) : (
            <Copy aria-hidden="true" className="size-5" />
          )}
          {state === "copied" ? labels.copied : labels.copy}
        </button>
      </div>
      {state === "failed" ? (
        <p role="status" className="text-sm text-fg-muted">
          {labels.copyFailed}
        </p>
      ) : null}
    </div>
  );
}

/**
 * WhatsApp and e-mail buttons with the fallback panels of EC-SITE-03 and EC-SITE-04. Without
 * JavaScript they are plain links. With JavaScript, when the browser cannot hand off (popup
 * blocked, no mail client, `wa.me` unreachable) the panel offers the public phone and e-mail to
 * copy. Nothing is sent, stored or tracked.
 */
export function ContactActions({
  labels,
  whatsappHref,
  mailtoHref,
  phone,
  email,
  subject,
  message,
  className,
  tone = "default",
  channels = "both",
  variant = "secondary",
}: ContactActionsProps) {
  const mainClass = tone === "onDark" ? actionOnDark : actionClass;
  const whatsappClass = variant === "primary" && tone !== "onDark" ? actionPrimary : mainClass;
  const [panel, setPanel] = useState<Channel | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const left = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const panelId = useId();

  useEffect(() => {
    const markLeft = () => {
      left.current = true;
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") markLeft();
    };
    window.addEventListener("blur", markLeft);
    window.addEventListener("pagehide", markLeft);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("blur", markLeft);
      window.removeEventListener("pagehide", markLeft);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearTimeout(timer.current);
    };
  }, []);

  useEffect(() => {
    if (panel !== null) heading.current?.focus();
  }, [panel]);

  function watch(channel: Channel) {
    left.current = false;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      if (!left.current) setPanel(channel);
    }, HANDOFF_TIMEOUT_MS);
  }

  function openWhatsApp(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    let opened: Window | null;
    try {
      opened = window.open(whatsappHref, "_blank");
    } catch {
      opened = null;
    }
    if (opened === null) {
      setPanel("whatsapp");
      return;
    }
    try {
      opened.opener = null;
    } catch {
      // Some browsers make `opener` read-only for cross-origin windows; the link already has rel=noopener.
    }
    watch("whatsapp");
  }

  function openEmail() {
    watch("email");
  }

  const title = panel === "whatsapp" ? labels.whatsappTitle : labels.emailTitle;
  const body = panel === "whatsapp" ? labels.whatsappBody : labels.emailBody;

  return (
    <div className={className}>
      <div className="flex flex-wrap gap-3">
        <a
          href={whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          onClick={openWhatsApp}
          className={whatsappClass}
          data-contact="whatsapp"
        >
          <MessageCircle aria-hidden="true" className="size-5" />
          {labels.whatsapp}
        </a>
        {channels === "both" ? (
          <a href={mailtoHref} onClick={openEmail} className={mainClass} data-contact="email">
            <Mail aria-hidden="true" className="size-5" />
            {labels.email}
          </a>
        ) : null}
      </div>
      {panel !== null ? (
        <section
          aria-labelledby={`${panelId}-title`}
          data-fallback={panel}
          className="mt-4 flex max-w-xl flex-col gap-4 rounded-[12px] border-2 border-border bg-surface p-5 text-left text-fg"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 id={`${panelId}-title`} ref={heading} tabIndex={-1} className="text-lg font-bold">
                {title}
              </h3>
              <p className="mt-1 text-fg-muted">{body}</p>
            </div>
            <button
              type="button"
              onClick={() => setPanel(null)}
              aria-label={labels.close}
              className="inline-flex size-12 shrink-0 items-center justify-center rounded-[8px] text-fg hover:bg-surface-strong"
            >
              <X aria-hidden="true" className="size-5" />
            </button>
          </div>
          {panel === "whatsapp" ? <CopyField label={labels.phoneLabel} value={phone} labels={labels} /> : null}
          <CopyField label={labels.emailLabel} value={email} labels={labels} />
          {panel === "email" ? <CopyField label={labels.subjectLabel} value={subject} labels={labels} /> : null}
          <CopyField label={labels.messageLabel} value={message} labels={labels} />
          <div className="flex flex-wrap gap-3">
            {panel === "whatsapp" ? (
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                onClick={openWhatsApp}
                className={actionClass}
              >
                {labels.openAgain}
              </a>
            ) : (
              <a href={mailtoHref} onClick={openEmail} className={actionClass}>
                {labels.openAgain}
              </a>
            )}
            {panel === "whatsapp" ? (
              <a href={mailtoHref} onClick={openEmail} className={actionClass}>
                <Mail aria-hidden="true" className="size-5" />
                {labels.email}
              </a>
            ) : (
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                onClick={openWhatsApp}
                className={actionClass}
              >
                <MessageCircle aria-hidden="true" className="size-5" />
                {labels.whatsapp}
              </a>
            )}
          </div>
          <p className="text-sm text-fg-muted">{labels.privacyNote}</p>
        </section>
      ) : null}
    </div>
  );
}
