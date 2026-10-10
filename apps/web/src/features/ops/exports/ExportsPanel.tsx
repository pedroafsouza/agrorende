"use client";

import { useTranslations } from "next-intl";

import { EXPORT_ENTITIES, type ExportEntity, type ExportFilters, type ExportStart } from "@/features/exports/api";

import { ExportButton } from "./ExportControls";

/** Exports offered from the Ops Center; GPS history (`location-pings`) is ADMIN only (A§12). */
export function exportEntitiesFor(role: string): readonly ExportEntity[] {
  return EXPORT_ENTITIES.filter((e) => e !== "location-pings" || role === "ADMIN");
}

export function ExportsPanel({ role, filters, start }: { readonly role: string; readonly filters?: ExportFilters; readonly start?: (entity: ExportEntity, filters: ExportFilters, locale: string) => Promise<ExportStart> }) {
  const t = useTranslations("ops.exports");
  return (
    <section aria-labelledby="ops-exports-title" className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold" id="ops-exports-title">
        {t("title")}
      </h2>
      <p className="text-sm text-[var(--ar-text-muted)]">{t("hint")}</p>
      <ul className="mt-1 flex flex-col gap-2 [&>li>div>div:first-child>button]:w-full [&>li>div>div:first-child>button]:justify-start">
        {exportEntitiesFor(role).map((entity) => (
          <li key={entity}>
            <ExportButton entity={entity} filters={filters ?? {}} label={t(`entity.${entity}`)} {...(start === undefined ? {} : { start })} />
          </li>
        ))}
      </ul>
    </section>
  );
}
