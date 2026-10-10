"use client";

import { LogOut, UserCircle } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { api } from "@/lib/api";

import { LanguageSwitch } from "./LanguageSwitch";
import { ThemeChoices } from "./ThemeToggle";

export function UserMenu({ name, roleLabel }: { readonly name: string; readonly roleLabel: string }) {
  const t = useTranslations("admin");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (event: MouseEvent) => {
      if (ref.current !== null && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  const logout = async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } finally {
      window.location.assign("/login");
    }
  };
  return (
    <div className="relative" ref={ref}>
      <button aria-expanded={open} aria-haspopup="menu" aria-label={t("shell.userMenu", { name })} className="flex min-h-12 items-center gap-2 rounded-controls px-3 text-sm font-semibold hover:bg-[var(--ar-surface-muted)]" onClick={() => setOpen((o) => !o)} type="button">
        <UserCircle aria-hidden="true" className="size-6" />
        <span className="hidden max-w-40 truncate md:inline">{name}</span>
      </button>
      {open ? (
        <div aria-label={t("shell.userMenu", { name })} className="absolute right-0 z-30 mt-1 w-72 max-w-[calc(100vw-1rem)] rounded-cards border border-[var(--ar-border)] bg-[var(--ar-surface)] p-2 shadow-lg" role="menu">
          <p className="px-3 py-2 text-sm">
            <span className="block font-semibold">{name}</span>
            <span className="text-[var(--ar-text-muted)]">{roleLabel}</span>
          </p>
          <Link className="flex min-h-12 items-center gap-2 rounded-controls px-3 hover:bg-[var(--ar-surface-muted)]" href="/account" onClick={() => setOpen(false)} role="menuitem">
            <UserCircle aria-hidden="true" className="size-5" />
            {t("nav.account")}
          </Link>
          <div className="mt-1 border-t border-[var(--ar-border)] px-1 pt-2">
            <p className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-[var(--ar-text-muted)]">{t("shell.themeTitle")}</p>
            <ThemeChoices />
          </div>
          <div className="mt-1 border-t border-[var(--ar-border)] px-1 pt-1">
            <LanguageSwitch showLabel />
          </div>
          <div className="mt-1 border-t border-[var(--ar-border)] pt-1">
          <button className="flex min-h-12 w-full items-center gap-2 rounded-controls px-3 text-left hover:bg-[var(--ar-surface-muted)]" onClick={() => void logout()} role="menuitem" type="button">
            <LogOut aria-hidden="true" className="size-5" />
            {t("shell.signOut")}
          </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
