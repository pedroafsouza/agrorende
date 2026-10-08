import { designTokens, radii, spacing, themes, typography, type StatusTone } from "@agrorende/design-tokens";
import { CircleCheck, CircleMinus, Info, OctagonAlert, TriangleAlert, type LucideIcon } from "lucide-react-native";
import { useSyncExternalStore } from "react";
import { useColorScheme } from "react-native";
import { createStore } from "zustand/vanilla";

export type ThemeName = keyof typeof themes;
export type ThemePreference = ThemeName | "system";

export interface Theme {
  readonly name: ThemeName;
  readonly background: string;
  readonly surface: string;
  readonly surfaceRaised: string;
  readonly text: string;
  readonly textSecondary: string;
  readonly border: string;
  readonly borderWidth: number;
  readonly primary: string;
  readonly primaryPressed: string;
  readonly onPrimary: string;
  readonly link: string;
  readonly accent: string;
  readonly danger: string;
  readonly onDanger: string;
}

const palette = designTokens.palette;

function build(name: ThemeName): Theme {
  const base = themes[name];
  const dark = name === "dark";
  return {
    name,
    background: base.background,
    surface: base.surface,
    surfaceRaised: base.surfaceRaised,
    text: base.text,
    textSecondary: base.textSecondary,
    border: base.border,
    borderWidth: "borderWidth" in base ? base.borderWidth : 1,
    primary: base.primary,
    primaryPressed: base.primaryPressed,
    onPrimary: dark ? palette["graphite-950"] : "#FFFFFF",
    link: base.link,
    accent: base.accent,
    danger: dark ? palette.danger.dark : palette.danger.light,
    onDanger: dark ? palette["graphite-950"] : "#FFFFFF",
  };
}

export const appThemes: Readonly<Record<ThemeName, Theme>> = { light: build("light"), dark: build("dark"), outdoor: build("outdoor") };

export const campoClaro = designTokens;
export const defaultTheme = appThemes.light;
export const minTouchTarget = designTokens.sizes.minTouchTarget;
export const primaryButtonHeight = designTokens.sizes.primaryButtonHeight;
export const outdoorBorderWidth = themes.outdoor.borderWidth;
export const space = spacing;
export const radius = radii;
export const type = typography.mobile;

export const themeStore = createStore<{ preference: ThemePreference }>()(() => ({ preference: "system" }));

export function setThemePreference(preference: ThemePreference): void {
  themeStore.setState({ preference });
}

export function resolveTheme(preference: ThemePreference, scheme: "light" | "dark" | null | undefined): Theme {
  if (preference === "system") return scheme === "dark" ? appThemes.dark : appThemes.light;
  return appThemes[preference];
}

export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(themeStore.subscribe, () => themeStore.getState().preference);
}

export function useTheme(): Theme {
  const preference = useThemePreference();
  const scheme = useColorScheme();
  return resolveTheme(preference, scheme);
}

const toneIcons: Readonly<Record<StatusTone, LucideIcon>> = {
  success: CircleCheck,
  warning: TriangleAlert,
  danger: OctagonAlert,
  info: Info,
  neutral: CircleMinus,
};

export interface ToneStyle {
  readonly color: string;
  readonly backgroundColor: string;
  readonly onFill: string;
  readonly icon: LucideIcon;
}

/** Status colour + icon (the word comes from the caller): colour is never the only signal. */
export function statusTone(tone: StatusTone, theme: Theme = defaultTheme): ToneStyle {
  const t = designTokens.statusTones[tone];
  if (theme.name === "dark") {
    const color = tone === "danger" ? palette.danger.dark : tone === "info" ? palette.info.dark : tone === "success" ? palette["mata-400"] : tone === "warning" ? palette.warning.fill : palette["graphite-200"];
    return { color, backgroundColor: theme.surfaceRaised, onFill: theme.text, icon: toneIcons[tone] };
  }
  const color = tone === "warning" ? palette.warning.onFill : t.color;
  return { color, backgroundColor: t.backgroundColor, onFill: color, icon: toneIcons[tone] };
}

export type { StatusTone };
