import type { CSSProperties } from "react";

import { designTokens, semanticStatus, typography } from "@agrorende/design-tokens";

type CssVariableName = `--${string}`;
type ThemeStyle = CSSProperties & Record<CssVariableName, string | number>;

export const campoClaroThemeStyle: ThemeStyle = designTokens.cssVariables;
export const campoClaroStatus = semanticStatus;
export const campoClaroTypography = typography;
