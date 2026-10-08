import type { LucideIcon } from "lucide-react-native";

import { useTheme } from "./theme";

export type IconProps = { readonly icon: LucideIcon; readonly size?: number; readonly color?: string };

/** Decorative icon; the caller always renders a text label next to it (UX-06). */
export function Icon({ icon: Glyph, size = 24, color }: IconProps) {
  const theme = useTheme();
  return <Glyph size={size} color={color ?? theme.text} accessibilityElementsHidden importantForAccessibility="no" />;
}
