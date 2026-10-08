import { designTokens, themes, type StatusTone } from "@agrorende/design-tokens";

export type ThemeName = keyof typeof themes;
export type Theme = (typeof themes)[ThemeName];

export const campoClaro = designTokens;
export const defaultTheme = themes.light;
export const minTouchTarget = designTokens.sizes.minTouchTarget;
export const primaryButtonHeight = designTokens.sizes.primaryButtonHeight;
export const outdoorBorderWidth = themes.outdoor.borderWidth;

export function statusTone(tone: StatusTone) {
  return designTokens.statusTones[tone];
}
