"use client";

import {
  ChevronRight,
  ChevronUp,
  CircleHelp,
  House,
  Lightbulb,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useId, useState } from "react";

import type { Role } from "@agrorende/contracts/enums";

import { visibleNav } from "@/components/shell/nav";
import {
  findNavItem,
  RELATED_PAGES,
  resolvePageContext,
} from "@/components/shell/pageContext";

export const PAGE_CONTEXT_HIDDEN_KEY = "agrorende.context.hidden";

function usePageContextHidden(): readonly [boolean, () => void] {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    try {
      setHidden(window.localStorage.getItem(PAGE_CONTEXT_HIDDEN_KEY) === "1");
    } catch {
      // Storage can be blocked; the explanation then stays open.
    }
  }, []);

  const toggle = useCallback(() => {
    setHidden((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(PAGE_CONTEXT_HIDDEN_KEY, next ? "1" : "0");
      } catch {
        // Not remembering the choice is acceptable.
      }
      return next;
    });
  }, []);

  return [hidden, toggle] as const;
}

const crumbLink =
  "inline-flex min-h-12 items-center gap-1.5 rounded-md px-1 font-medium text-[var(--ar-link)] hover:underline";

/** Breadcrumbs and a short "about this page" explanation for every admin section, derived from the URL. */
export function PageContext({ role }: { readonly role: Role | null }) {
  const t = useTranslations("admin");
  const pathname = usePathname();
  const [hidden, toggle] = usePageContextHidden();
  const panelId = useId();
  const info = resolvePageContext(pathname);

  if (info === null) {
    return null;
  }

  const section = findNavItem(info.key);
  const SectionIcon = section?.icon ?? CircleHelp;
  const visible = visibleNav(role);
  const related = (RELATED_PAGES[info.key] ?? [])
    .map((key) => findNavItem(key, visible))
    .filter((item) => item !== undefined);
  const trail = info.trail.filter((crumb) => crumb.key !== "ops");
  const crumbs = [
    { key: "home", href: "/ops", label: t("context.home") },
    ...trail.map((crumb) => ({
      key: crumb.key,
      href: crumb.href,
      label: t(`nav.${crumb.key}`),
    })),
  ];
  const current =
    info.leaf === null
      ? crumbs[crumbs.length - 1]
      : { key: info.leaf, href: pathname, label: t(`context.${info.leaf}`) };
  const links = info.leaf === null ? crumbs.slice(0, -1) : crumbs;

  return (
    <div className="mb-4 flex flex-col gap-2" data-testid="page-context">
      <div className="flex flex-wrap items-center gap-2">
        <nav aria-label={t("context.breadcrumb")} className="min-w-0 flex-1">
          <ol className="flex flex-wrap items-center gap-1 text-sm">
            {links.map((crumb) => (
              <li className="flex items-center gap-1" key={crumb.key}>
                <Link className={crumbLink} href={crumb.href}>
                  {crumb.key === "home" ? (
                    <House aria-hidden="true" className="size-4" />
                  ) : null}
                  {crumb.label}
                </Link>
                <ChevronRight
                  aria-hidden="true"
                  className="size-4 text-[var(--ar-text-muted)]"
                />
              </li>
            ))}
            {current === undefined ? null : (
              <li
                className="flex min-h-12 items-center gap-1.5 px-1 font-semibold"
                aria-current="page"
              >
                {current.key === "home" ? (
                  <House aria-hidden="true" className="size-4" />
                ) : null}
                {current.label}
              </li>
            )}
          </ol>
        </nav>
        <button
          aria-controls={hidden ? undefined : panelId}
          aria-expanded={!hidden}
          className="inline-flex min-h-12 items-center gap-2 rounded-md px-3 text-sm font-semibold text-[var(--ar-link)] hover:bg-[var(--ar-surface-muted)]"
          data-testid="page-context-toggle"
          onClick={toggle}
          type="button"
        >
          {hidden ? (
            <CircleHelp aria-hidden="true" className="size-5" />
          ) : (
            <ChevronUp aria-hidden="true" className="size-5" />
          )}
          {hidden ? t("context.show") : t("context.hide")}
        </button>
      </div>
      {hidden ? null : (
        <section
          aria-label={t("context.about")}
          className="flex gap-4 rounded-xl border border-[var(--ar-border)] bg-[var(--ar-surface-muted)] p-4"
          id={panelId}
        >
          <span
            aria-hidden="true"
            className="hidden size-12 shrink-0 items-center justify-center rounded-lg bg-[var(--ar-primary-bg)] text-[var(--ar-primary-text)] sm:flex"
          >
            <SectionIcon className="size-6" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <p className="text-[var(--ar-text)]">
              {t(`context.pages.${info.key}.body`)}
            </p>
            <p className="flex items-start gap-2 text-sm text-[var(--ar-text-muted)]">
              <Lightbulb
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0"
              />
              <span>
                <span className="font-semibold text-[var(--ar-text)]">
                  {t("context.whatYouCanDo")}:{" "}
                </span>
                {t(`context.pages.${info.key}.tasks`)}
              </span>
            </p>
            {related.length === 0 ? null : (
              <nav
                aria-label={t("context.related")}
                className="flex flex-wrap items-center gap-x-1 text-sm"
              >
                <span className="mr-1 text-[var(--ar-text-muted)]">
                  {t("context.related")}:
                </span>
                {related.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link className={crumbLink} href={item.href} key={item.key}>
                      <Icon aria-hidden="true" className="size-4" />
                      {t(`nav.${item.key}`)}
                    </Link>
                  );
                })}
              </nav>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
