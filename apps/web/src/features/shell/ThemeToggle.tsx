"use client";

import { Monitor, Moon, Sun, SunMedium } from "lucide-react";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

const ORDER = ["system", "light", "dark", "outdoor"] as const;
type ThemeChoice = (typeof ORDER)[number];
const ICON = { system: Monitor, light: Sun, dark: Moon, outdoor: SunMedium } as const;

function useThemeChoice() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const current: ThemeChoice = mounted && ORDER.includes(theme as ThemeChoice) ? (theme as ThemeChoice) : "system";
  return { current, setTheme };
}

/** The four themes as menu radio items, for the user menu (SIMPLER-TO-SELL §4). */
export function ThemeChoices() {
  const t = useTranslations("admin");
  const { current, setTheme } = useThemeChoice();
  return (
    <div aria-label={t("shell.themeTitle")} className="grid grid-cols-2 gap-1" role="group">
      {ORDER.map((choice) => {
        const Icon = ICON[choice];
        const selected = choice === current;
        return (
          <button
            aria-checked={selected}
            className={`flex min-h-12 items-center gap-2 rounded-controls border px-3 text-left text-sm font-semibold ${selected ? "border-[var(--ar-primary)] bg-[var(--ar-primary-bg)] text-[var(--ar-primary-text)]" : "border-transparent hover:bg-[var(--ar-surface-muted)]"}`}
            key={choice}
            onClick={() => setTheme(choice)}
            role="menuitemradio"
            type="button"
          >
            <Icon aria-hidden="true" className="size-5 shrink-0" />
            {t(`shell.theme.${choice}`)}
          </button>
        );
      })}
    </div>
  );
}

/** Cycles system → light → dark → outdoor (high contrast for sunlight, A§3.7). */
export function ThemeToggle() {
  const t = useTranslations("admin");
  const { current, setTheme } = useThemeChoice();
  const Icon = ICON[current];
  const next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length] ?? "system";
  return (
    <button
      aria-label={t("shell.themeLabel", { theme: t(`shell.theme.${current}`) })}
      className="flex min-h-12 items-center gap-2 rounded-controls px-3 text-sm font-semibold hover:bg-[var(--ar-surface-muted)]"
      onClick={() => setTheme(next)}
      title={t("shell.themeLabel", { theme: t(`shell.theme.${current}`) })}
      type="button"
    >
      <Icon aria-hidden="true" className="size-5" />
      <span className="hidden xl:inline">{t(`shell.theme.${current}`)}</span>
    </button>
  );
}
