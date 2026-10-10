"use client";

import { ChevronDown, Menu, PanelLeftClose, PanelLeftOpen, Search, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState, type ReactNode } from "react";

import type { Role } from "@agrorende/contracts/enums";

import { BrandMark } from "@/components/brand/BrandLogo";
import { openCommandPalette } from "@/features/command-palette";
import { RealtimeStatus } from "@/components/recovery/RealtimeStatus";
import { isActive, navSections, visibleNav, type NavItem, type NavSection } from "@/components/shell/nav";
import { cn } from "@/lib/cn";

import { PageContext } from "./PageContext";
import { NotificationsBell, useAttentionCount } from "./NotificationsBell";
import { useMe } from "./useMe";
import { UserMenu } from "./UserMenu";
import { useRealtime } from "./useRealtime";
import { useClosedNavGroups } from "./useClosedNavGroups";
import { useSidebarCollapsed } from "./useSidebarCollapsed";

function NavLink({ item, pathname, attention, collapsed, nested = false, onNavigate }: { readonly item: NavItem; readonly pathname: string; readonly attention: number; readonly collapsed: boolean; readonly nested?: boolean; readonly onNavigate: () => void }) {
  const t = useTranslations("admin");
  const active = isActive(pathname, item.href) && !(item.children ?? []).some((c) => isActive(pathname, c.href));
  const Icon = item.icon;
  const label = t(`nav.${item.key}`);
  const showBadge = item.badge === "attention" && attention > 0;
  return (
    <li>
      <Link
        aria-current={active ? "page" : undefined}
        className={cn(
          "relative flex min-h-12 items-center gap-3 rounded-controls px-3 text-sm font-medium",
          nested && "pl-10",
          collapsed && "lg:justify-center lg:px-0",
          collapsed && nested && "lg:pl-0",
          active ? "bg-[var(--ar-primary-bg)] font-semibold text-[var(--ar-primary-text)]" : "text-[var(--ar-text)] hover:bg-[var(--ar-surface-muted)]",
        )}
        href={item.href}
        onClick={onNavigate}
        title={collapsed ? label : undefined}
      >
        <Icon aria-hidden="true" className={cn("size-5 shrink-0", collapsed && nested && "lg:size-4")} />
        <span className={cn("flex-1", collapsed && "lg:sr-only")}>{label}</span>
        {showBadge ? (
          <span
            className={cn(
              "rounded-full bg-[var(--ar-danger)] px-2 text-xs font-bold text-[var(--ar-on-danger)]",
              collapsed && "lg:absolute lg:right-1 lg:top-1 lg:px-1.5",
            )}
          >
            <span className="sr-only">{t("shell.attentionCount", { count: attention })}</span>
            <span aria-hidden="true">{attention > 99 ? "99+" : attention}</span>
          </span>
        ) : null}
      </Link>
      {item.children === undefined || item.children.length === 0 ? null : (
        <ul>
          {item.children.map((child) => (
            <NavLink attention={attention} collapsed={collapsed} item={child} key={child.href} nested onNavigate={onNavigate} pathname={pathname} />
          ))}
        </ul>
      )}
    </li>
  );
}

function containsActive(item: NavItem, pathname: string): boolean {
  return isActive(pathname, item.href) || (item.children ?? []).some((child) => containsActive(child, pathname));
}

/**
 * One sidebar category. The heading folds it; a folded category holding the current page shows a
 * dot. On the icon rail the heading becomes a thin divider and every icon stays visible.
 */
function NavCategory({ section, first, pathname, attention, collapsed, folded, onToggle, onNavigate }: { readonly section: NavSection; readonly first: boolean; readonly pathname: string; readonly attention: number; readonly collapsed: boolean; readonly folded: boolean; readonly onToggle: () => void; readonly onNavigate: () => void }) {
  const t = useTranslations("admin");
  const label = t(`navGroups.${section.group}`);
  const current = section.items.some((item) => containsActive(item, pathname));
  const open = !folded;
  const listId = `nav-group-${section.group}`;
  return (
    <li className={cn(!first && "mt-1")} data-nav-group={section.group}>
      {collapsed && !first ? <hr aria-hidden="true" className="mx-2 mb-2 hidden border-[var(--ar-border)] lg:block" /> : null}
      <button
        aria-controls={listId}
        aria-expanded={open}
        aria-label={open ? t("shell.hideGroup", { group: label }) : t("shell.showGroup", { group: label })}
        className={cn(
          "flex min-h-12 w-full items-center gap-2 rounded-controls px-3 text-left text-xs font-semibold text-[var(--ar-text-muted)] hover:bg-[var(--ar-surface-muted)] hover:text-[var(--ar-text)]",
          collapsed && "lg:hidden",
        )}
        onClick={onToggle}
        type="button"
      >
        <span className="flex-1">{label}</span>
        {!open && current ? <span aria-hidden="true" className="size-2 rounded-full bg-[var(--ar-primary)]" /> : null}
        <ChevronDown aria-hidden="true" className={cn("size-4 transition-transform motion-reduce:transition-none", !open && "-rotate-90")} />
      </button>
      <ul aria-label={label} className={cn("flex flex-col gap-0.5", !open && "hidden", !open && collapsed && "lg:flex")} id={listId}>
        {section.items.map((item) => (
          <NavLink attention={attention} collapsed={collapsed} item={item} key={item.href} onNavigate={onNavigate} pathname={pathname} />
        ))}
      </ul>
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
  const [collapsed, toggleCollapsed] = useSidebarCollapsed();
  const effectiveRole = me.data?.user.role ?? role;
  const office = effectiveRole === "ADMIN" || effectiveRole === "MANAGER";
  const realtime = useRealtime(office);
  const attention = useAttentionCount(office);
  const sections = navSections(visibleNav(effectiveRole));
  const [closedGroups, toggleGroup] = useClosedNavGroups();
  const close = () => setOpen(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target !== null && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
      if (!typing && (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "b") {
        event.preventDefault();
        toggleCollapsed();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleCollapsed]);

  return (
    <div className="min-h-screen bg-[var(--ar-bg)] text-[var(--ar-text)]">
      <a className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded-controls focus:bg-[var(--ar-surface)] focus:p-3" href="#main">
        {t("shell.skipToContent")}
      </a>
      {ribbon}
      <div className={cn("lg:grid lg:transition-[grid-template-columns] lg:duration-200 motion-reduce:transition-none", collapsed ? "lg:grid-cols-[4.5rem_1fr]" : "lg:grid-cols-[17rem_1fr]")} data-sidebar={collapsed ? "collapsed" : "expanded"}>
        <aside
          aria-label={t("shell.sidebar")}
          className={cn(
            "fixed inset-y-0 left-0 z-40 flex w-72 flex-col overflow-y-auto overflow-x-hidden border-r border-[var(--ar-border)] bg-[var(--ar-surface)] p-3 transition-transform lg:sticky lg:top-0 lg:h-screen lg:w-auto lg:translate-x-0",
            open ? "translate-x-0" : "-translate-x-full",
          )}
          id="admin-sidebar"
        >
          <div className={cn("mb-3 flex items-center gap-2 px-2", collapsed && "lg:justify-center lg:px-0")}>
            <Link className="flex min-h-12 min-w-0 flex-1 items-center gap-2.5 text-lg font-bold lg:flex-none" href="/ops" onClick={close} title={collapsed ? (me.data?.org?.name ?? t("shell.brand")) : undefined}>
              <BrandMark className="size-9" />
              <span className={cn("truncate", collapsed && "lg:sr-only")}>{me.data?.org?.name ?? t("shell.brand")}</span>
            </Link>
            <button aria-label={t("shell.closeMenu")} className="flex size-12 items-center justify-center lg:hidden" onClick={close} type="button">
              <X aria-hidden="true" className="size-5" />
            </button>
          </div>
          <nav aria-label={t("shell.mainNav")} className="flex-1">
            <ul>
              {sections.map((section, index) => (
                <NavCategory
                  attention={attention}
                  collapsed={collapsed}
                  first={index === 0}
                  folded={closedGroups.has(section.group)}
                  key={section.group}
                  onNavigate={close}
                  onToggle={() => toggleGroup(section.group)}
                  pathname={pathname}
                  section={section}
                />
              ))}
            </ul>
          </nav>
        </aside>
        {open ? <button aria-label={t("shell.closeMenu")} className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={close} type="button" /> : null}
        <div className="flex min-w-0 flex-col">
          <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-[var(--ar-border)] bg-[var(--ar-surface)] px-3 py-1">
            <button aria-label={t("shell.openMenu")} className="flex size-12 items-center justify-center lg:hidden" onClick={() => setOpen(true)} type="button">
              <Menu aria-hidden="true" className="size-5" />
            </button>
            <button
              aria-controls="admin-sidebar"
              aria-expanded={!collapsed}
              aria-keyshortcuts="Control+B Meta+B"
              aria-label={collapsed ? t("shell.expandMenu") : t("shell.collapseMenu")}
              className="hidden size-12 shrink-0 items-center justify-center rounded-controls text-[var(--ar-text-muted)] hover:bg-[var(--ar-surface-muted)] hover:text-[var(--ar-text)] lg:flex"
              data-testid="sidebar-toggle"
              onClick={toggleCollapsed}
              title={`${collapsed ? t("shell.expandMenu") : t("shell.collapseMenu")} (Ctrl+B)`}
              type="button"
            >
              {collapsed ? <PanelLeftOpen aria-hidden="true" className="size-5" /> : <PanelLeftClose aria-hidden="true" className="size-5" />}
            </button>
            <div className="relative max-w-md flex-1">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--ar-text-muted)]" />
              <button
                aria-keyshortcuts="Control+K Meta+K"
                aria-label={t("shell.search")}
                className="min-h-12 w-full rounded-controls border border-[var(--ar-border)] bg-[var(--ar-bg)] pl-9 pr-3 text-left text-sm text-[var(--ar-text-muted)]"
                data-testid="shell-search"
                onClick={openCommandPalette}
                type="button"
              >
                {t("shell.searchSoon")}
              </button>
            </div>
            <div className="ml-auto flex items-center gap-1">
              {effectiveRole === "ADMIN" ? <RealtimeStatus state={realtime} /> : null}
              <NotificationsBell />
              <UserMenu name={me.data?.user.name ?? ""} roleLabel={effectiveRole === null ? "" : t(`roles.${effectiveRole}`)} />
            </div>
          </header>
          {banner}
          <main className="mx-auto w-full max-w-7xl flex-1 p-4 lg:p-6" id="main" tabIndex={-1}>
            <PageContext role={effectiveRole} />
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
