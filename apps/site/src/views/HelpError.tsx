import { ERROR_META, type AppErrorCode } from "@agrorende/contracts/errors";
import { ChevronRight, CircleAlert, Lightbulb, RotateCcw, Ban } from "lucide-react";

import { Contact } from "@/components/Contact";
import { container } from "@/components/ui";
import { type SiteLocale } from "@/lib/locales";
import { pagePath } from "@/lib/routes";
import { errorCopy, getTranslator } from "@/i18n/messages";

export function HelpErrorView({ locale, code }: { readonly locale: SiteLocale; readonly code: AppErrorCode }) {
  const t = getTranslator(locale);
  const meta = ERROR_META[code];
  const copy = errorCopy(locale, code);
  const helpHref = pagePath("help", locale);
  return (
    <article className={`${container} max-w-3xl py-12`}>
      <nav aria-label={t("helpError.breadcrumb")} className="text-sm">
        <ol className="flex flex-wrap items-center gap-1 text-fg-muted">
          <li>
            <a href={helpHref} className="prose-link inline-flex min-h-12 items-center">
              {t("helpError.breadcrumb")}
            </a>
          </li>
          <li aria-hidden="true">
            <ChevronRight className="size-4" />
          </li>
          <li>
            <a href={`${helpHref}#codigos`} className="prose-link inline-flex min-h-12 items-center">
              {t("helpError.codesLink")}
            </a>
          </li>
        </ol>
      </nav>
      <p className="mt-4 text-sm font-semibold text-fg-muted">
        {t("helpError.codeLabel")} <code className="rounded-[4px] bg-surface-strong px-1.5 py-0.5 font-mono text-fg">{code}</code>
      </p>
      <h1 className="accent-rule mt-4 text-4xl font-bold tracking-tight text-balance">{copy?.title ?? code}</h1>

      <section className="mt-10 flex gap-4" aria-labelledby="what-happened">
        <CircleAlert aria-hidden="true" className="mt-1 size-6 shrink-0 text-info" />
        <div>
          <h2 id="what-happened" className="text-xl font-bold">
            {t("helpError.whatHappened")}
          </h2>
          <p className="mt-2 text-lg">{copy?.body}</p>
        </div>
      </section>

      <section className="mt-8 flex gap-4" aria-labelledby="what-to-do">
        <Lightbulb aria-hidden="true" className="mt-1 size-6 shrink-0 text-success" />
        <div>
          <h2 id="what-to-do" className="text-xl font-bold">
            {t("helpError.whatToDo")}
          </h2>
          <p className="mt-2 text-lg">{copy?.action}</p>
          <p className="mt-3 flex items-start gap-2 text-fg-muted">
            {meta.retryable ? (
              <RotateCcw aria-hidden="true" className="mt-1 size-4 shrink-0" />
            ) : (
              <Ban aria-hidden="true" className="mt-1 size-4 shrink-0" />
            )}
            {meta.retryable ? t("helpError.retryable") : t("helpError.notRetryable")}
          </p>
        </div>
      </section>

      {copy?.help !== undefined ? (
        <details className="faq mt-8 rounded-[12px] border border-border px-5">
          <summary className="flex min-h-14 cursor-pointer items-center text-lg font-semibold">{t("helpError.moreHelp")}</summary>
          <p className="pb-5">{copy.help}</p>
        </details>
      ) : null}

      {meta.recovery.length > 0 ? (
        <section className="mt-10" aria-labelledby="options">
          <h2 id="options" className="text-xl font-bold">
            {t("helpError.options")}
          </h2>
          <ul className="mt-3 flex list-disc flex-col gap-2 pl-6">
            {meta.recovery.map((pattern) => (
              <li key={pattern}>{t(`recovery.${pattern}`)}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-12 rounded-[12px] border border-border bg-surface p-6" aria-labelledby="contact-title">
        <h2 id="contact-title" className="text-xl font-bold">
          {t("help.contactTitle")}
        </h2>
        <p className="mt-2 text-fg-muted">{t("help.contactBody")}</p>
        <Contact locale={locale} className="mt-5" />
      </section>

      <footer className="mt-10 text-sm text-fg-muted">
        <p>{meta.kind === "server" ? t("helpError.kindServer") : t("helpError.kindClient")}</p>
        <p className="mt-1">
          {t("helpError.reference")}{" "}
          <span className="font-mono" data-ec-entries="true">
            {meta.entries.join(" · ")}
          </span>
        </p>
      </footer>
    </article>
  );
}
