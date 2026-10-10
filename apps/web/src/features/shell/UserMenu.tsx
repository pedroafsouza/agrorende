"use client";

import { Flag, LogOut, UserCircle } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";

import { useGuideModal } from "@/features/onboarding/GuideModal";
import { api } from "@/lib/api";

import { LanguageSwitch } from "./LanguageSwitch";
import { ThemeChoices } from "./ThemeToggle";
import { useDisclosure } from "./useDisclosure";

const ITEM = "flex min-h-12 w-full items-center gap-2 rounded-controls px-3 text-left hover:bg-[var(--ar-surface-muted)]";

/**
 * Account and preferences popover. It is a disclosure, not an ARIA menu: it holds a theme group
 * and a language select, so focus moves into the panel, Tab walks through it, and Escape or a
 * click outside closes it and returns focus to the button.
 */
export function UserMenu({ name, roleLabel, showGuide = false }: { readonly name: string; readonly roleLabel: string; readonly showGuide?: boolean }) {
  const t = useTranslations("admin");
  const guide = useTranslations("tenancy.guide");
  const guideModal = useGuideModal();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  useDisclosure({ open, setOpen, rootRef, buttonRef, panelRef });
  useEffect(() => {
    if (open) panelRef.current?.querySelector<HTMLElement>("a, button, select")?.focus();
  }, [open]);
  const logout = async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } finally {
      window.location.assign("/login");
    }
  };
  return (
    <div className="relative" ref={rootRef}>
      <button
        aria-controls={panelId}
        aria-expanded={open}
        aria-label={t("shell.userMenu", { name })}
        className="flex min-h-12 items-center gap-2 rounded-controls px-3 text-sm font-semibold hover:bg-[var(--ar-surface-muted)]"
        onClick={() => setOpen((o) => !o)}
        ref={buttonRef}
        type="button"
      >
        <UserCircle aria-hidden="true" className="size-6" />
        <span className="hidden max-w-40 truncate md:inline">{name}</span>
      </button>
      {open ? (
        <div aria-label={t("shell.userMenu", { name })} className="absolute right-0 z-30 mt-1 w-72 max-w-[calc(100vw-1rem)] rounded-cards border border-[var(--ar-border)] bg-[var(--ar-surface)] p-2 shadow-lg" id={panelId} ref={panelRef} role="region">
          <p className="px-3 py-2 text-sm">
            <span className="block font-semibold">{name}</span>
            <span className="text-[var(--ar-text-muted)]">{roleLabel}</span>
          </p>
          <Link className={ITEM} href="/account" onClick={() => setOpen(false)}>
            <UserCircle aria-hidden="true" className="size-5" />
            {t("nav.account")}
          </Link>
          {showGuide && guideModal !== null ? (
            <button
              aria-haspopup="dialog"
              className={ITEM}
              data-testid="user-menu-guide"
              onClick={() => {
                setOpen(false);
                // Focus goes back to the menu button so it is the guide's return target.
                buttonRef.current?.focus();
                guideModal.open();
              }}
              type="button"
            >
              <Flag aria-hidden="true" className="size-5" />
              {guide("title")}
            </button>
          ) : showGuide ? (
            <Link className={ITEM} data-testid="user-menu-guide" href="/getting-started" onClick={() => setOpen(false)}>
              <Flag aria-hidden="true" className="size-5" />
              {guide("title")}
            </Link>
          ) : null}
          <div className="mt-1 border-t border-[var(--ar-border)] px-1 pt-2">
            <p className="px-2 pb-1 text-xs font-semibold text-[var(--ar-text-muted)]">{t("shell.themeTitle")}</p>
            <ThemeChoices />
          </div>
          <div className="mt-1 border-t border-[var(--ar-border)] px-1 pt-1">
            <LanguageSwitch showLabel />
          </div>
          <div className="mt-1 border-t border-[var(--ar-border)] pt-1">
            <button className={ITEM} onClick={() => void logout()} type="button">
              <LogOut aria-hidden="true" className="size-5" />
              {t("shell.signOut")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
