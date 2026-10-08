import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

const navItems = [
  "page.ops.title",
  "page.attention.title",
  "page.reports.title",
  "page.workOrders.title",
  "page.rentals.title",
  "page.assets.title",
  "page.sites.title",
  "page.customers.title",
  "page.team.title",
  "page.templates.title",
  "page.seasons.title",
  "page.costs.title",
  "page.imports.title",
  "page.settings.title",
  "page.notifications.title",
] as const;

const navIcon = "◼";
const providerSeparator = " · ";

export function AdminShell({ children }: { readonly children: ReactNode }) {
  const t = useTranslations("web");

  return (
    <div className="min-h-screen bg-graphite-50 text-graphite-900 lg:grid lg:grid-cols-[18rem_1fr]">
      <aside className="border-b border-graphite-200 bg-white p-4 lg:border-b-0 lg:border-r">
        <p className="text-lg font-semibold text-graphite-950">{t("shell.org")}</p>
        <nav className="mt-6 grid gap-2">
          {navItems.map((item) => (
            <a className="min-h-touch rounded-controls border border-transparent px-3 py-3 text-sm font-medium text-graphite-700 hover:border-mata-700 hover:text-mata-800" href="#" key={item}>
              <span aria-hidden="true">{navIcon}</span>
              <span className="ml-2">{t(item)}</span>
            </a>
          ))}
        </nav>
      </aside>
      <div className="min-w-0">
        <header className="flex flex-wrap items-center gap-3 border-b border-graphite-200 bg-white p-4">
          <div className="min-h-touch flex-1 rounded-controls border border-graphite-200 px-4 py-3 text-sm text-graphite-700">{t("shell.search")}</div>
          <button className="min-h-touch rounded-controls border border-graphite-200 px-3 text-sm font-semibold" type="button">{t("shell.notifications")}</button>
          <button className="min-h-touch rounded-controls border border-graphite-200 px-3 text-sm font-semibold" type="button">{t("shell.theme")}</button>
          <button className="min-h-touch rounded-controls border border-graphite-200 px-3 text-sm font-semibold" type="button">{t("shell.language")}</button>
          <button className="min-h-touch rounded-controls border border-graphite-200 px-3 text-sm font-semibold" type="button">{t("shell.user")}</button>
        </header>
        <div className="border-b border-graphite-200 bg-white px-4 py-2 text-xs font-semibold text-mata-800">
          {t("shell.realtime")}
          {providerSeparator}
          {t("shell.toaster")}
        </div>
        {children}
      </div>
    </div>
  );
}
