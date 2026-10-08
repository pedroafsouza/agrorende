export const campoClaroPalette = {
  "mata-600": "#2B8A3E",
  "mata-700": "#237032",
  "mata-800": "#1B5E2A",
  "mata-400": "#51CF66",
  "terra-600": "#E8590C",
  "terra-700": "#C2410C",
  "graphite-950": "#111315",
  "graphite-900": "#1C1F23",
  "graphite-700": "#3D434B",
  "graphite-500": "#6B7280",
  "graphite-200": "#E3E6EA",
  "graphite-100": "#F1F3F5",
  "graphite-50": "#F8F9FA",
  success: "#237032",
  warning: {
    text: "#A15C07",
    fill: "#F2B705",
    onFill: "#1C1F23",
  },
  danger: {
    light: "#B42318",
    dark: "#F97066",
  },
  info: {
    light: "#1D4ED8",
    dark: "#60A5FA",
  },
  neutral: "#3D434B",
} as const;

export type CampoClaroPalette = typeof campoClaroPalette;
export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";

export const statusTones = {
  success: {
    color: campoClaroPalette.success,
    backgroundColor: "#E7F6EA",
    icon: "circle-check",
    word: "Operational",
  },
  warning: {
    color: campoClaroPalette.warning.text,
    backgroundColor: campoClaroPalette.warning.fill,
    icon: "triangle-alert",
    word: "Needs attention",
  },
  danger: {
    color: campoClaroPalette.danger.light,
    backgroundColor: "#FEE4E2",
    icon: "octagon-alert",
    word: "Stopped",
  },
  info: {
    color: campoClaroPalette.info.light,
    backgroundColor: "#DBEAFE",
    icon: "info",
    word: "In progress",
  },
  neutral: {
    color: campoClaroPalette.neutral,
    backgroundColor: campoClaroPalette["graphite-100"],
    icon: "circle-minus",
    word: "Inactive",
  },
} as const satisfies Record<StatusTone, { color: string; backgroundColor: string; icon: string; word: string }>;

const status = <T extends StatusTone>(tone: T) => ({
  tone,
  color: statusTones[tone].color,
  icon: statusTones[tone].icon,
  word: statusTones[tone].word,
});

export const semanticStatus = {
  assetCondition: {
    OPERATIONAL: status("success"),
    NEEDS_REPAIR: status("warning"),
    IN_REPAIR: status("info"),
    OUT_OF_SERVICE: status("danger"),
    RETIRED: status("neutral"),
  },
  fieldReport: {
    SUBMITTED: status("info"),
    IN_REVIEW: status("info"),
    MARKED_FOR_REPAIR: status("warning"),
    MONITORING: status("warning"),
    DISMISSED: status("neutral"),
  },
  workOrder: {
    OPEN: status("warning"),
    ASSIGNED: status("info"),
    ACCEPTED: status("info"),
    EN_ROUTE: status("info"),
    ON_SITE: status("info"),
    IN_PROGRESS: status("info"),
    ON_HOLD: status("warning"),
    COMPLETED: status("success"),
    VERIFIED: status("success"),
    CANCELLED: status("neutral"),
  },
  rental: {
    DRAFT: status("neutral"),
    RESERVED: status("info"),
    ACTIVE: status("success"),
    RETURNED: status("info"),
    CLOSED: status("success"),
    CANCELLED: status("neutral"),
  },
  sync: {
    SYNCED: status("success"),
    APPLIED: status("success"),
    PENDING: status("warning"),
    QUEUED: status("warning"),
    IN_FLIGHT: status("info"),
    PULLING: status("info"),
    PUSHING: status("info"),
    REJECTED: status("danger"),
    FAILED: status("danger"),
    PAUSED: status("neutral"),
    OFFLINE: status("neutral"),
  },
} as const;

export const typography = {
  mobile: {
    family: "system",
    body: { fontSize: 17, lineHeight: 24, fontWeight: "400" },
    primaryButtonLabel: { fontSize: 18, lineHeight: 24, fontWeight: "600" },
    maxFontScale: 1.3,
  },
  web: {
    sans: "Geist Sans",
    mono: "Geist Mono",
    dense: { fontSize: 14, lineHeight: 20 },
    default: { fontSize: 16, lineHeight: 24 },
    tabularNumbers: { fontVariantNumeric: "tabular-nums" },
  },
} as const;

export const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  14: 56,
  16: 64,
  20: 80,
} as const;

export const radii = {
  controls: 8,
  cards: 12,
  sheets: 16,
} as const;

export const sizes = {
  minTouchTarget: 48,
  primaryButtonHeight: 56,
} as const;

export const motion = {
  fast: 100,
  default: 150,
  slow: 200,
  maxDurationMs: 200,
  reducedMotionDurationMs: 0,
} as const;

export const zIndex = {
  base: 0,
  sticky: 10,
  dropdown: 20,
  overlay: 30,
  sheet: 40,
  toast: 50,
} as const;

export const themes = {
  light: {
    name: "light",
    background: "#FFFFFF",
    surface: campoClaroPalette["graphite-50"],
    surfaceRaised: "#FFFFFF",
    text: campoClaroPalette["graphite-900"],
    textSecondary: campoClaroPalette["graphite-700"],
    border: campoClaroPalette["graphite-200"],
    primary: campoClaroPalette["mata-700"],
    primaryPressed: campoClaroPalette["mata-800"],
    link: campoClaroPalette["mata-700"],
    accent: campoClaroPalette["terra-600"],
  },
  dark: {
    name: "dark",
    background: campoClaroPalette["graphite-950"],
    surface: campoClaroPalette["graphite-900"],
    surfaceRaised: "#252A30",
    text: "#FFFFFF",
    textSecondary: campoClaroPalette["graphite-200"],
    border: campoClaroPalette["graphite-700"],
    primary: campoClaroPalette["mata-400"],
    primaryPressed: campoClaroPalette["mata-600"],
    link: campoClaroPalette["mata-400"],
    accent: campoClaroPalette["terra-600"],
  },
  outdoor: {
    name: "outdoor",
    background: "#FFFFFF",
    surface: "#FFFFFF",
    surfaceRaised: "#FFFFFF",
    text: campoClaroPalette["graphite-950"],
    textSecondary: campoClaroPalette["graphite-950"],
    border: campoClaroPalette["graphite-950"],
    borderWidth: 2,
    primary: campoClaroPalette["mata-800"],
    primaryPressed: campoClaroPalette["mata-800"],
    link: campoClaroPalette["mata-800"],
    accent: campoClaroPalette["terra-700"],
  },
} as const;

export const cssVariables = {
  "--color-mata-600": campoClaroPalette["mata-600"],
  "--color-mata-700": campoClaroPalette["mata-700"],
  "--color-mata-800": campoClaroPalette["mata-800"],
  "--color-mata-400": campoClaroPalette["mata-400"],
  "--color-terra-600": campoClaroPalette["terra-600"],
  "--color-terra-700": campoClaroPalette["terra-700"],
  "--color-graphite-950": campoClaroPalette["graphite-950"],
  "--color-graphite-900": campoClaroPalette["graphite-900"],
  "--color-graphite-700": campoClaroPalette["graphite-700"],
  "--color-graphite-500": campoClaroPalette["graphite-500"],
  "--color-graphite-200": campoClaroPalette["graphite-200"],
  "--color-graphite-100": campoClaroPalette["graphite-100"],
  "--color-graphite-50": campoClaroPalette["graphite-50"],
  "--color-success": campoClaroPalette.success,
  "--color-warning": campoClaroPalette.warning.text,
  "--color-warning-fill": campoClaroPalette.warning.fill,
  "--color-danger": campoClaroPalette.danger.light,
  "--color-danger-dark": campoClaroPalette.danger.dark,
  "--color-info": campoClaroPalette.info.light,
  "--color-info-dark": campoClaroPalette.info.dark,
  "--color-neutral": campoClaroPalette.neutral,
  "--radius-controls": `${radii.controls}px`,
  "--radius-cards": `${radii.cards}px`,
  "--radius-sheets": `${radii.sheets}px`,
  "--spacing-touch-target": `${sizes.minTouchTarget}px`,
  "--spacing-primary-button-height": `${sizes.primaryButtonHeight}px`,
  "--motion-fast": `${motion.fast}ms`,
  "--motion-default": `${motion.default}ms`,
  "--motion-slow": `${motion.slow}ms`,
  "--font-size-mobile-body": `${typography.mobile.body.fontSize}px`,
  "--font-size-primary-button": `${typography.mobile.primaryButtonLabel.fontSize}px`,
  "--font-size-web-dense": `${typography.web.dense.fontSize}px`,
  "--font-size-web-default": `${typography.web.default.fontSize}px`,
} as const;

export const designTokens = {
  palette: campoClaroPalette,
  statusTones,
  semanticStatus,
  typography,
  spacing,
  radii,
  sizes,
  motion,
  zIndex,
  themes,
  cssVariables,
} as const;
