"use client";

import { useQuery } from "@tanstack/react-query";
import { Command } from "cmdk";
import {
  Building2,
  CornerDownLeft,
  FileText,
  Flag,
  Loader2,
  MapPinned,
  Plus,
  Search,
  Tractor,
  Truck,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

import type {
  SearchHitDTO,
  SearchResultsDTO,
  SearchType,
} from "@agrorende/core/modules/ops/search";

import { Dialog } from "@/components/ui/Dialog";
import { visibleNav, type NavItem } from "@/components/shell/nav";
import { useMe } from "@/features/shell/useMe";
import { api } from "@/lib/api";

const MIN_LENGTH = 2;
const DEBOUNCE_MS = 150;
const RESULT_GROUPS: readonly {
  readonly type: SearchType;
  readonly icon: LucideIcon;
  readonly showSubtitle: boolean;
}[] = [
  { type: "assets", icon: Tractor, showSubtitle: true },
  { type: "workOrders", icon: Wrench, showSubtitle: false },
  { type: "fieldReports", icon: FileText, showSubtitle: false },
  { type: "rentals", icon: Truck, showSubtitle: false },
  { type: "customers", icon: Building2, showSubtitle: true },
  { type: "sites", icon: MapPinned, showSubtitle: true },
];
const ACTIONS: readonly { readonly key: string; readonly href: string; readonly icon: LucideIcon; readonly adminOnly?: boolean }[] = [
  { key: "newWorkOrder", href: "/work-orders/new", icon: Wrench },
  { key: "newRental", href: "/rentals/new", icon: Truck },
  { key: "newAsset", href: "/assets/new", icon: Tractor },
  // The getting-started guide has no sidebar entry, so ADMINs reach it here and from the user menu.
  { key: "gettingStarted", href: "/getting-started", icon: Flag, adminOnly: true },
];

const fold = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

function flatten(items: readonly NavItem[]): NavItem[] {
  return items.flatMap((item) => [item, ...flatten(item.children ?? [])]);
}

function useDebounced(value: string, ms: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

const itemClass =
  "flex min-h-12 cursor-pointer items-center gap-3 rounded-controls px-3 py-2 text-left data-[selected=true]:bg-[var(--ar-surface-muted)] data-[selected=true]:outline data-[selected=true]:outline-2 data-[selected=true]:outline-[var(--ar-primary)]";
const headingClass =
  "[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:text-[var(--ar-text-muted)]";

export function CommandPaletteDialog({ onClose }: { readonly onClose: () => void }) {
  const t = useTranslations("admin");
  const router = useRouter();
  const me = useMe();
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  // The native dialog's showModal() runs in the parent's effect and focuses its close button,
  // so the search box takes focus on the next frame instead of through autoFocus.
  useEffect(() => {
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);
  const q = useDebounced(text.trim(), DEBOUNCE_MS);
  const searching = q.length >= MIN_LENGTH;
  const results = useQuery({
    queryKey: ["search", q],
    queryFn: ({ signal }) => api<SearchResultsDTO>("/search", { query: { q }, signal }),
    enabled: searching,
    staleTime: 30_000,
  });
  const deferred = useDeferredValue(results.data);

  const role = me.data?.user.role ?? null;
  const filter = fold(text.trim());
  const pages = useMemo(
    () =>
      flatten(visibleNav(role === null ? "MANAGER" : role)).map((item) => ({
        ...item,
        label: t(`nav.${item.key}`),
      })),
    [role, t],
  );
  const shownPages = filter === "" ? pages : pages.filter((p) => fold(p.label).includes(filter));
  const shownActions = ACTIONS.filter((a) => a.adminOnly !== true || role === "ADMIN").map((a) => ({
    ...a,
    label: t(`commandPalette.actions.${a.key}`),
  })).filter((a) => filter === "" || fold(a.label).includes(filter));
  const hits = searching && deferred?.q === q ? deferred : undefined;
  const hitCount =
    hits === undefined ? 0 : RESULT_GROUPS.reduce((n, g) => n + hits[g.type].length, 0);

  const go = (href: string) => {
    onClose();
    router.push(href);
  };

  return (
    <Dialog
      className="mx-auto mt-[15vh] mb-auto max-w-[40rem]"
      closeLabel={t("commandPalette.close")}
      onClose={onClose}
      open
      title={t("commandPalette.label")}
    >
      <Command
        className="-m-4 flex flex-col"
        label={t("commandPalette.label")}
        loop
        shouldFilter={false}
      >
        <div className="flex items-center gap-2 border-b border-[var(--ar-border)] px-3">
          <Search aria-hidden="true" className="size-5 shrink-0 text-[var(--ar-text-muted)]" />
          <Command.Input
            aria-label={t("commandPalette.inputLabel")}
            ref={inputRef}
            className="min-h-12 flex-1 bg-transparent text-base outline-none"
            onValueChange={setText}
            placeholder={t("commandPalette.placeholder")}
            value={text}
          />
          {searching && results.isFetching ? (
            <Loader2
              aria-label={t("commandPalette.loading")}
              className="size-5 animate-spin text-[var(--ar-text-muted)]"
              role="status"
            />
          ) : null}
        </div>
        <Command.List className={`max-h-[55vh] overflow-y-auto p-2 ${headingClass}`}>
          {text.trim().length > 0 && text.trim().length < MIN_LENGTH ? (
            <p className="px-3 py-2 text-sm text-[var(--ar-text-muted)]">
              {t("commandPalette.minLength", { count: MIN_LENGTH })}
            </p>
          ) : null}
          {searching && results.isError ? (
            <div className="flex items-center justify-between gap-3 px-3 py-2 text-sm" role="alert">
              <span>{t("commandPalette.error")}</span>
              <button
                className="min-h-12 rounded-controls border border-[var(--ar-border)] px-3 font-semibold"
                onClick={() => void results.refetch()}
                type="button"
              >
                {t("commandPalette.retry")}
              </button>
            </div>
          ) : null}
          {hits === undefined
            ? null
            : RESULT_GROUPS.filter((g) => hits[g.type].length > 0).map((g) => (
                <Command.Group heading={t(`commandPalette.groups.${g.type}`)} key={g.type}>
                  {hits[g.type].map((hit: SearchHitDTO) => (
                    <Command.Item
                      className={itemClass}
                      key={hit.id}
                      onSelect={() => go(hit.href)}
                      value={`${g.type}:${hit.id}`}
                    >
                      <g.icon
                        aria-hidden="true"
                        className="size-5 shrink-0 text-[var(--ar-text-muted)]"
                      />
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate font-medium">{hit.title}</span>
                        {g.showSubtitle && hit.subtitle !== null ? (
                          <span className="truncate text-sm text-[var(--ar-text-muted)]">
                            {hit.subtitle}
                          </span>
                        ) : null}
                      </span>
                    </Command.Item>
                  ))}
                </Command.Group>
              ))}
          {searching &&
          hits !== undefined &&
          hitCount === 0 &&
          shownPages.length === 0 &&
          shownActions.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-[var(--ar-text-muted)]" role="status">
              {t("commandPalette.empty", { query: q })}
            </p>
          ) : null}
          {shownActions.length > 0 ? (
            <Command.Group heading={t("commandPalette.groups.actions")}>
              {shownActions.map((a) => (
                <Command.Item
                  className={itemClass}
                  key={a.key}
                  onSelect={() => go(a.href)}
                  value={`action:${a.key}`}
                >
                  {a.adminOnly === true ? <span aria-hidden="true" className="size-5 shrink-0" /> : <Plus aria-hidden="true" className="size-5 shrink-0 text-[var(--ar-primary)]" />}
                  <a.icon
                    aria-hidden="true"
                    className="size-5 shrink-0 text-[var(--ar-text-muted)]"
                  />
                  <span>{a.label}</span>
                </Command.Item>
              ))}
            </Command.Group>
          ) : null}
          {shownPages.length > 0 ? (
            <Command.Group heading={t("commandPalette.groups.pages")}>
              {shownPages.map((p) => (
                <Command.Item
                  className={itemClass}
                  key={p.href}
                  onSelect={() => go(p.href)}
                  value={`page:${p.href}`}
                >
                  <p.icon
                    aria-hidden="true"
                    className="size-5 shrink-0 text-[var(--ar-text-muted)]"
                  />
                  <span>{t("commandPalette.goTo", { page: p.label })}</span>
                </Command.Item>
              ))}
            </Command.Group>
          ) : null}
        </Command.List>
        <p className="flex items-center gap-2 border-t border-[var(--ar-border)] px-3 py-2 text-xs text-[var(--ar-text-muted)]">
          <CornerDownLeft aria-hidden="true" className="size-4" />
          {t("commandPalette.hint")}
        </p>
      </Command>
    </Dialog>
  );
}
