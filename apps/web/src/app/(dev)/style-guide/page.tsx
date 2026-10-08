import { notFound } from "next/navigation";

import { PlaceholderPage } from "@/components/foundation/StateScaffold";
import { useTranslations } from "next-intl";

const statuses = [
  ["✓", "style.statusSuccess", "border-success text-success"],
  ["!", "style.statusWarning", "border-warning text-warning"],
  ["×", "style.statusDanger", "border-danger text-danger"],
  ["i", "style.statusInfo", "border-info text-info"],
] as const;

export default function Styleguidepage() {
  const t = useTranslations("web");

  if (process.env.APP_ENV === "production") {
    notFound();
  }

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <PlaceholderPage descriptionKey="style.description" route="/style-guide" titleKey="style.title" />
      <section className="grid gap-4 md:grid-cols-2">
        <article className="rounded-cards border-2 border-graphite-950 bg-white p-6 text-graphite-950">
          <h2 className="text-xl font-semibold">{t("style.outdoor")}</h2>
          <p className="mt-3">{t("style.touch")}</p>
          <button className="mt-4 min-h-primary rounded-controls bg-mata-800 px-5 text-lg font-semibold text-white" type="button">{t("style.primaryAction")}</button>
        </article>
        <article className="rounded-cards border border-graphite-200 bg-white p-6">
          <h2 className="text-xl font-semibold text-graphite-950">{t("style.iconText")}</h2>
          <div className="mt-4 grid gap-3">
            {statuses.map(([icon, key, className]) => (
              <div className={`min-h-touch rounded-controls border px-4 py-3 font-semibold ${className}`} key={key}>
                <span aria-hidden="true">{icon}</span>
                <span className="ml-2">{t(key)}</span>
              </div>
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}
