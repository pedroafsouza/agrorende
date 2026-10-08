"use client";

import { Menu, Search, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";

import type { Role } from "@agrorende/contracts/enums";

import { RealtimeStatus } from "@/components/recovery/RealtimeStatus";
import { isActive, visibleNav, type NavItem } from "@/components/shell/nav";
import { cn } from "@/lib/cn";

import { LanguageSwitch } from "./LanguageSwitch";
import { NotificationsBell, useAttentionCount } from "./NotificationsBell";
import { ThemeToggle } from "./ThemeToggle";
import { useMe } from "./useMe";
import { UserMenu } from "./UserMenu";
import { useRealtime } from "./useRealtime";

function NavLink({ item, pathname, attention, nested = false, onNavigate }: { readonly item: NavItem; readonly pathname: string; readonly attention: number; readonly nested?: boolean; readonly onNavigate: () => void }) {
  const t = useTranslations("admin");
  const active = isActive(pathname, item.href) && !(item.children ?? []).some((c) => isActive(pathname, c.href));
  const Icon = item.icon;
  return (
    <li>
      <Link
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex min-h-12 items-center gap-3 rounded-controls px-3 text-sm font-medium",
          nested && "pl-10",
          active ? "bg-[var(--ar-primary-bg)] font-semibold text-[var(--ar-primary-text)]" : "text-[var(--ar-text)] hover:bg-[var(--ar-surface-muted)]",
        )}
        href={item.href}
        onClick={onNavigate}
      >
        <Icon aria-hidden="true" className="size-5 shrink-0" />
        <span className="flex-1">{t(`nav.${item.key}`)}</span>
        {item.badge === "attention" && attention > 0 ? (
          <span className="rounded-full bg-[var(--ar-danger)] px-2 text-xs font-bold text-white">
            <span className="sr-only">{t("shell.attentionCount", { count: attention })}</span>
            <span aria-hidden="true">{attention > 99 ? "99+" : attention}</span>
          </span>
        ) : null}
      </Link>
      {item.children === undefined || item.children.length === 0 ? null : (
        <ul>
          {item.children.map((child) => (
            <NavLink attention={attention} item={child} key={child.href} nested onNavigate={onNavigate} pathname={pathname} />
          ))}
        </ul>
      )}
    </li>
  );
}

export interface AdminShellProps {
  readonly role: Role | null;
  readonly ribbon: ReactNode;
  readonly banner?: ReactNode;
  readonly children: ReactNode;
}

/** Sidebar + top bar for every `(admin)` page (A§14.1): org name, search, bell, theme, language, user menu, realtime. */
export function AdminShell({ role, ribbon, banner, children }: AdminShellProps) {
  const t = useTranslations("admin");
  const pathname = usePathname();
  const me = useMe();
  const [open, setOpen] = useState(false);
  const effectiveRole = me.data?.user.role ?? role;
  const office = effectiveRole === "ADMIN" || effectiveRole === "MANAGER";
  const realtime = useRealtime(office);
  const attention = useAttentionCount(office);
  const items = visibleNav(effectiveRole);
  const primary = items.filter((i) => i.p1 !== true);
  const more = items.filter((i) => i.p1 === true);
  const close = () => setOpen(false);

  return (
    <div className="min-h-screen bg-[var(--ar-bg)] text-[var(--ar-text)]">
      <a className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded-controls focus:bg-[var(--ar-surface)] focus:p-3" href="#main">
        {t("shell.skipToContent")}
      </a>
      {ribbon}
      <div className="lg:grid lg:grid-cols-[17rem_1fr]">
        <aside
          aria-label={t("shell.sidebar")}
          className={cn(
            "fixed inset-y-0 left-0 z-40 w-72 overflow-y-auto border-r border-[var(--ar-border)] bg-[var(--ar-surface)] p-3 transition-transform lg:sticky lg:top-0 lg:h-screen lg:w-auto lg:translate-x-0",
            open ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div className="mb-3 flex items-center gap-2 px-2">
            <Link className="flex min-h-12 flex-1 items-center text-lg font-bold" href="/ops" onClick={close}>
              {me.data?.org?.name ?? t("shell.brand")}
            </Link>
            <button aria-label={t("shell.closeMenu")} className="flex size-12 items-center justify-center lg:hidden" onClick={close} type="button">
              <X aria-hidden="true" className="size-5" />
            </button>
          </div>
          <nav aria-label={t("shell.mainNav")}>
            <ul className="flex flex-col gap-0.5">
              {primary.map((item) => (
                <NavLink attention={attention} item={item} key={item.href} onNavigate={close} pathname={pathname} />
              ))}
            </ul>
            {more.length === 0 ? null : (
              <>
                <p className="mt-4 px-3 text-xs font-semibold uppercase tracking-wide text-[var(--ar-text-muted)]">{t("shell.more")}</p>
                <ul className="mt-1 flex flex-col gap-0.5">
                  {more.map((item) => (
                    <NavLink attention={attention} item={item} key={item.href} onNavigate={close} pathname={pathname} />
                  ))}
                </ul>
              </>
            )}
          </nav>
        </aside>
        {open ? <button aria-label={t("shell.closeMenu")} className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={close} type="button" /> : null}
        <div className="flex min-w-0 flex-col">
          <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-[var(--ar-border)] bg-[var(--ar-surface)] px-3 py-1">
            <button aria-label={t("shell.openMenu")} className="flex size-12 items-center justify-center lg:hidden" onClick={() => setOpen(true)} type="button">
              <Menu aria-hidden="true" className="size-5" />
            </button>
            <div className="relative max-w-md flex-1">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--ar-text-muted)]" />
              <input
                aria-label={t("shell.search")}
                className="min-h-12 w-full rounded-controls border border-[var(--ar-border)] bg-[var(--ar-bg)] pl-9 pr-3 text-sm"
                disabled
                placeholder={t("shell.searchSoon")}
                type="search"
              />
            </div>
            <div className="ml-auto flex items-center gap-1">
              <RealtimeStatus state={realtime} />
              <NotificationsBell />
              <ThemeToggle />
              <LanguageSwitch />
              <UserMenu name={me.data?.user.name ?? ""} roleLabel={effectiveRole === null ? "" : t(`roles.${effectiveRole}`)} />
            </div>
          </header>
          {banner}
          <main className="mx-auto w-full max-w-7xl flex-1 p-4 lg:p-6" id="main" tabIndex={-1}>
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
