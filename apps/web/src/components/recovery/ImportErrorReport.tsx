"use client";

import { Download } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/Button";

export interface ImportRowError {
  readonly row: number;
  readonly field: string;
  readonly message: string;
}

/** Row-level import problems with a CSV download of the failing rows (EC-ADM-04). */
export function ImportErrorReport({ errors, fileName = "import-errors.csv" }: { readonly errors: readonly ImportRowError[]; readonly fileName?: string }) {
  const t = useTranslations("common");
  if (errors.length === 0) return null;
  const download = () => {
    const lines = ["row,field,message", ...errors.map((e) => `${e.row},"${e.field.replace(/"/gu, '""')}","${e.message.replace(/"/gu, '""')}"`)];
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <section className="rounded-cards border-2 border-[var(--ar-warning)] bg-[var(--ar-warning-bg)] p-4" role="alert">
      <div className="flex flex-wrap items-center gap-3">
        <p className="flex-1 font-semibold">{t("import.errorsTitle", { count: errors.length })}</p>
        <Button icon={<Download aria-hidden="true" className="size-4" />} onClick={download}>
          {t("import.download")}
        </Button>
      </div>
      <ul className="mt-2 max-h-60 overflow-y-auto text-sm">
        {errors.slice(0, 50).map((e) => (
          <li key={`${e.row}-${e.field}`}>{t("import.rowError", { row: e.row, field: e.field, message: e.message })}</li>
        ))}
      </ul>
    </section>
  );
}
