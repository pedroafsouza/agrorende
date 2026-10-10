"use client";

import type { NotificationDTO } from "@agrorende/contracts/dto";
import type { NotificationType } from "@agrorende/contracts/enums";
import { useQuery } from "@tanstack/react-query";
import { AlarmClock, Bell, Camera, CheckCheck, Download, FileText, MessageSquare, Package, RotateCw, Smartphone, Truck, UserCheck, Wrench, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";

import { Lottie } from "@/components/motion/Lottie";
import { notificationHref } from "@/features/notifications/NotificationsPage";
import { notificationDisplay } from "@/features/notifications/notificationDisplay";
import { useDisclosure } from "@/features/shell/useDisclosure";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import type { ListPage } from "@/lib/forms";
import { useSave } from "@/lib/useSave";

import { formatRelativeTime } from "./relativeTime";

export const FLYOUT_LIMIT = 8;
export const FLYOUT_QUERY_KEY = ["notifications", "flyout"] as const;
export const UNREAD_QUERY_KEY = ["notifications", { unread: true }] as const;

const TYPE_ICON: Record<NotificationType, LucideIcon> = {
  WO_ASSIGNED: Wrench,
  WO_UPDATED: Wrench,
  WO_CANCELLED: Wrench,
  WO_REASSIGNED_AWAY: Wrench,
  REPORT_CRITICAL: FileText,
  REPORT_MARKED_FOR_REPAIR: FileText,
  RENTAL_DUE_SOON: Truck,
  RENTAL_OVERDUE: Truck,
  SLA_AT_RISK: AlarmClock,
  DEVICE_STALE_SYNC: Smartphone,
  LATE_EVIDENCE: Camera,
  JOINED_WITH_OTHER_EMAIL: UserCheck,
  COMMENT_ADDED: MessageSquare,
  EXPORT_READY: Download,
  MAINTENANCE_DUE: Wrench,
  LOW_STOCK: Package,
};

const isUnread = (n: Pick<NotificationDTO, "readAt">) => (n.readAt ?? null) === null;

/**
 * Bell in the top bar that opens a notifications popover anchored to it: unread count, the
 * latest eight notifications, "Marcar todas como lidas" and a "Ver todas" link to the full page.
 * Selecting a row marks it read and opens the related record. On phones the panel is a
 * full-width sheet right under the top bar.
 */
export function NotificationsFlyout() {
  const t = useTranslations("admin");
  const locale = useLocale();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [sheetTop, setSheetTop] = useState(56);
  const panelId = useId();
  const titleId = `${panelId}-title`;
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  useDisclosure({ open, setOpen, rootRef, buttonRef, panelRef });

  const unread = useQuery({ queryKey: UNREAD_QUERY_KEY, queryFn: () => api<ListPage<NotificationDTO>>("/notifications", { query: { unread: true } }), refetchInterval: 60_000, retry: false });
  const latest = useQuery({ queryKey: FLYOUT_QUERY_KEY, queryFn: () => api<ListPage<NotificationDTO>>("/notifications", { query: { limit: FLYOUT_LIMIT } }), enabled: open, retry: false });
  const [markRead, markState] = useSave("notifications", (body: { ids: string[] } | { all: true }) => api("/notifications/read", { method: "POST", body }));
  const count = unread.data?.items.length ?? 0;
  const items = latest.data?.items.slice(0, FLYOUT_LIMIT) ?? [];

  useLayoutEffect(() => {
    if (!open) return;
    const bar = rootRef.current?.closest("header");
    if (bar) setSheetTop(Math.max(0, bar.getBoundingClientRect().bottom));
  }, [open]);
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  const select = (n: NotificationDTO) => {
    if (isUnread(n)) void markRead({ ids: [n.id] });
    const href = notificationHref(n);
    setOpen(false);
    if (href !== null) router.push(href);
  };

  const label = count > 99 ? "99+" : String(count);
  return (
    <div className="relative" ref={rootRef}>
      <button
        aria-controls={panelId}
        aria-expanded={open}
        aria-label={t("shell.notificationsLabel", { count })}
        className={cn("relative flex size-12 items-center justify-center rounded-controls hover:bg-[var(--ar-surface-muted)]", open && "bg-[var(--ar-surface-muted)]")}
        data-testid="notifications-bell"
        onClick={() => setOpen((o) => !o)}
        ref={buttonRef}
        type="button"
      >
        <Bell aria-hidden="true" className="size-5" />
        {count > 0 ? (
          <span aria-hidden="true" className="absolute right-1 top-1 min-w-5 rounded-full bg-[var(--ar-danger)] px-1 text-center text-xs font-bold text-[var(--ar-on-danger)]">
            {label}
          </span>
        ) : null}
      </button>
      {open ? (
        <div
          aria-labelledby={titleId}
          className="fixed inset-x-0 top-[var(--flyout-top)] z-40 flex max-h-[calc(100dvh-var(--flyout-top))] flex-col border-b border-[var(--ar-border)] bg-[var(--ar-surface)] shadow-lg outline-none sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-1 sm:max-h-[min(36rem,calc(100dvh-5rem))] sm:w-[26rem] sm:rounded-cards sm:border"
          data-testid="notifications-flyout"
          id={panelId}
          ref={panelRef}
          role="dialog"
          style={{ "--flyout-top": `${sheetTop}px` } as CSSProperties}
          tabIndex={-1}
        >
          <div className="flex items-center gap-3 border-b border-[var(--ar-border)] py-2 pl-4 pr-2">
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold" id={titleId}>
                {t("notifications.title")}
              </h2>
              <p className="text-sm text-[var(--ar-text-muted)]" data-testid="flyout-unread">
                {t("shell.notificationsPanel.unreadCount", { count })}
              </p>
            </div>
            {count > 0 ? (
              <button
                aria-busy={markState.busy}
                className="inline-flex min-h-12 items-center gap-2 rounded-controls px-3 text-sm font-semibold text-[var(--ar-link)] hover:bg-[var(--ar-surface-muted)] disabled:opacity-60"
                disabled={markState.busy}
                onClick={() => void markRead({ all: true })}
                type="button"
              >
                <CheckCheck aria-hidden="true" className="size-4" />
                {t("notifications.markAllRead")}
              </button>
            ) : null}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {latest.isLoading ? (
              <div aria-busy="true" className="flex flex-col gap-1 p-2" role="status">
                <span className="sr-only">{t("shell.notificationsPanel.loading")}</span>
                {Array.from({ length: 4 }, (_, i) => (
                  <div className="h-16 animate-pulse rounded-controls bg-[var(--ar-surface-muted)] motion-reduce:animate-none" key={i} />
                ))}
              </div>
            ) : latest.error !== null ? (
              <div className="flex flex-col items-start gap-2 p-4" role="alert">
                <p className="text-sm">{t("shell.notificationsPanel.error")}</p>
                <button className="inline-flex min-h-12 items-center gap-2 rounded-controls border border-[var(--ar-border-strong)] px-4 text-sm font-semibold" onClick={() => void latest.refetch()} type="button">
                  <RotateCw aria-hidden="true" className="size-4" />
                  {t("shell.notificationsPanel.retry")}
                </button>
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center gap-1 px-4 py-6 text-center">
                <Lottie className="max-w-28" id="empty" playOnce />
                <p className="font-semibold">{t("notifications.emptyTitle")}</p>
                <p className="text-sm text-[var(--ar-text-muted)]">{t("notifications.emptyBody")}</p>
              </div>
            ) : (
              <ul className="flex flex-col p-1">
                {items.map((n) => {
                  const Icon = TYPE_ICON[n.type] ?? Bell;
                  const fresh = isUnread(n);
                  const shown = notificationDisplay(n, (key, values) => t(`notifications.display.${key}`, values));
                  return (
                    <li key={n.id}>
                      <button className="flex min-h-12 w-full items-start gap-3 rounded-controls px-3 py-2.5 text-left hover:bg-[var(--ar-surface-muted)]" data-testid="flyout-row" data-unread={fresh} onClick={() => select(n)} type="button">
                        <span aria-hidden="true" className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--ar-surface-muted)] text-[var(--ar-text-muted)]">
                          <Icon className="size-4" />
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className={cn("truncate text-sm", fresh ? "font-semibold" : "font-medium")}>
                            {fresh ? <span className="sr-only">{t("notifications.unread")} </span> : null}
                            {shown.title}
                          </span>
                          <span className="truncate text-sm text-[var(--ar-text-muted)]">
                            {shown.reference === null ? null : <span className="font-mono text-xs">{shown.reference} </span>}
                            {shown.body}
                          </span>
                        </span>
                        <span className="flex shrink-0 flex-col items-end gap-1.5 pt-0.5">
                          <time className="whitespace-nowrap text-xs text-[var(--ar-text-muted)]" dateTime={n.createdAt}>
                            {formatRelativeTime(n.createdAt, locale)}
                          </time>
                          {fresh ? <span aria-hidden="true" className="size-2 rounded-full bg-[var(--ar-primary)]" /> : null}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="border-t border-[var(--ar-border)] p-1">
            <Link className="flex min-h-12 items-center justify-center gap-2 rounded-controls text-sm font-semibold text-[var(--ar-link)] hover:bg-[var(--ar-surface-muted)]" href="/notifications" onClick={() => setOpen(false)}>
              {t("shell.notificationsPanel.seeAll")}
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
