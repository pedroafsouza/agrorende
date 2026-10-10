import { FileText, TriangleAlert } from "lucide-react";

import { LEGAL_CONTENT, type LegalDocumentKey } from "../../content";
import { container } from "@/components/ui";
import { siteConfig } from "@/lib/config";
import { type SiteLocale } from "@/lib/locales";
import { pagePath } from "@/lib/routes";
import { getTranslator } from "@/i18n/messages";

const DOCUMENTS: readonly LegalDocumentKey[] = ["privacy", "terms", "dpa"];

export function LegalView({ locale, document }: { readonly locale: SiteLocale; readonly document: LegalDocumentKey }) {
  const t = getTranslator(locale);
  const doc = LEGAL_CONTENT[locale][document];
  return (
    <div className={`${container} grid gap-12 py-12 lg:grid-cols-[1fr_16rem]`}>
      <article className="max-w-3xl" data-legal={document}>
        <h1 className="accent-rule text-4xl font-bold tracking-tight text-balance">{doc.title}</h1>
        <p className="mt-3 text-sm text-fg-muted" data-terms-version={siteConfig.termsVersion}>
          {t("legal.version", { version: siteConfig.termsVersion })}
        </p>
        <aside
          className="mt-6 flex gap-3 rounded-[12px] border-2 border-[color:var(--warning-fill)] bg-surface p-4"
          data-legal-review="pending"
        >
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-warning" />
          <div>
            <p className="font-semibold">{t("legal.pendingReview")}</p>
            <p className="text-fg-muted">{t("legal.pendingReviewBody")}</p>
          </div>
        </aside>
        <p className="mt-8 text-lg">{doc.intro}</p>
        {doc.sections.map((section) => (
          <section key={section.id} id={section.id} aria-labelledby={`${section.id}-h`} className="mt-10 scroll-mt-6">
            <h2 id={`${section.id}-h`} className="text-2xl font-bold">
              {section.heading}
            </h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph} className="mt-3 leading-relaxed">
                {paragraph}
              </p>
            ))}
            {section.list !== undefined ? (
              <ul className="mt-3 flex list-disc flex-col gap-2 pl-6 leading-relaxed">
                {section.list.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}
      </article>
      <aside className="flex flex-col gap-8 lg:sticky lg:top-6 lg:self-start">
        <nav aria-label={t("legal.contents")}>
          <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-fg-muted">{t("legal.contents")}</h2>
          <ul className="mt-2 flex flex-col">
            {doc.sections.map((section) => (
              <li key={section.id}>
                <a href={`#${section.id}`} className="inline-flex min-h-12 items-center text-fg underline-offset-4 hover:underline">
                  {section.heading}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-label={t("legal.otherDocuments")}>
          <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-fg-muted">{t("legal.otherDocuments")}</h2>
          <ul className="mt-2 flex flex-col">
            {DOCUMENTS.filter((key) => key !== document).map((key) => (
              <li key={key}>
                <a href={pagePath(key, locale)} className="inline-flex min-h-12 items-center gap-2 text-fg underline-offset-4 hover:underline">
                  <FileText aria-hidden="true" className="size-4" />
                  {LEGAL_CONTENT[locale][key].title}
                </a>
              </li>
            ))}
            <li>
              <a href={pagePath("deleteAccount", locale)} className="inline-flex min-h-12 items-center gap-2 text-fg underline-offset-4 hover:underline">
                <FileText aria-hidden="true" className="size-4" />
                {t("footer.deleteAccount")}
              </a>
            </li>
          </ul>
        </nav>
      </aside>
    </div>
  );
}
