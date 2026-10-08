"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";

export interface SummaryItem {
  readonly field: string;
  readonly label: string;
  readonly message: string;
}

/** Lists every invalid field at the top of a form with a link that focuses it; keeps entered values (REC-02, UX-13). */
export function FormErrorSummary({ items, formId }: { readonly items: readonly SummaryItem[]; readonly formId: string }) {
  const t = useTranslations("common");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (items.length > 0) ref.current?.focus();
  }, [items.length]);
  if (items.length === 0) return null;
  return (
    <div className="rounded-cards border-2 border-[var(--ar-danger)] bg-[var(--ar-danger-bg)] p-4" ref={ref} role="alert" tabIndex={-1}>
      <p className="font-semibold">{t("form.summaryTitle", { count: items.length })}</p>
      <ul className="mt-2 list-disc pl-5 text-sm">
        {items.map((item) => (
          <li key={item.field}>
            <button
              className="min-h-0 text-left text-[var(--ar-link)] underline"
              onClick={() => {
                const el = document.querySelector<HTMLElement>(`#${CSS.escape(formId)} [name="${CSS.escape(item.field)}"]`);
                el?.focus();
              }}
              type="button"
            >
              {item.label}: {item.message}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
