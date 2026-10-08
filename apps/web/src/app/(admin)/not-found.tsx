import { FileQuestion } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

export default function AdminNotFound() {
  const t = useTranslations("common");
  return (
    <div className="flex flex-col items-center gap-3 p-10 text-center">
      <FileQuestion aria-hidden="true" className="size-10" />
      <h1 className="text-xl font-bold">{t("notFound.title")}</h1>
      <p>{t("notFound.body")}</p>
      <Link className="flex min-h-12 items-center rounded-controls border border-[var(--ar-border-strong)] px-4 font-semibold" href="/ops">
        {t("notFound.back")}
      </Link>
    </div>
  );
}
