import { Info, Languages, Wifi, X } from "lucide-react";

import { type SiteLocale } from "@/lib/locales";
import { errorCopy, getTranslator } from "@/i18n/messages";

import { container } from "./ui";

/** EC-SITE-05: shown only when JavaScript is off; everything else on the page still works. */
export function NoScriptNote({ locale }: { readonly locale: SiteLocale }) {
  const copy = errorCopy(locale, "JS_DISABLED");
  if (copy === undefined) return null;
  return (
    <noscript>
      <div className="border-b border-border bg-surface">
        <p className={`${container} flex items-start gap-2 py-3 text-sm`}>
          <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-info" />
          <span>
            <strong className="font-semibold">{copy.title}</strong> {copy.body}
          </span>
        </p>
      </div>
    </noscript>
  );
}

/** EC-SITE-06: revealed by CSS when the head script turns on lite mode. */
export function LiteNotice({ locale }: { readonly locale: SiteLocale }) {
  const t = getTranslator(locale);
  const copy = errorCopy(locale, "SITE_SLOW_NETWORK");
  if (copy === undefined) return null;
  return (
    <div className="lite-notice border-b border-border bg-surface" role="status" data-lite-notice="true">
      <div className={`${container} flex flex-wrap items-center gap-x-4 gap-y-2 py-2 text-sm`}>
        <Wifi aria-hidden="true" className="size-4 shrink-0 text-info" />
        <p className="flex-1">
          <strong className="font-semibold">{copy.title}</strong> {copy.body}
        </p>
        <button
          type="button"
          data-lite-retry="true"
          className="inline-flex min-h-12 items-center rounded-[8px] px-3 font-semibold text-link underline underline-offset-4"
        >
          {t("notices.liteLoadImages")}
        </button>
      </div>
    </div>
  );
}

/** EC-SITE-01: hidden until the body script sees `?unsupported=` after a locale fallback. */
export function LocaleBanner({ locale }: { readonly locale: SiteLocale }) {
  const t = getTranslator(locale);
  const copy = errorCopy(locale, "SITE_LOCALE_UNSUPPORTED");
  if (copy === undefined) return null;
  return (
    <div id="locale-banner" hidden role="status" className="border-b border-border bg-surface">
      <div className={`${container} flex items-center gap-3 py-2 text-sm`}>
        <Languages aria-hidden="true" className="size-4 shrink-0 text-info" />
        <p className="flex-1">
          <strong className="font-semibold">{copy.title}</strong> {copy.body}
        </p>
        <button
          type="button"
          data-dismiss="locale-banner"
          aria-label={t("notices.dismiss")}
          className="inline-flex size-12 items-center justify-center rounded-[8px] hover:bg-surface-strong"
        >
          <X aria-hidden="true" className="size-5" />
        </button>
      </div>
    </div>
  );
}
