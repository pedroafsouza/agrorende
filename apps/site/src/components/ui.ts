/** Shared class lists. Targets are at least 48 px tall (ARCHITECTURE §3.7). */
export const container = "mx-auto w-full max-w-6xl px-5 sm:px-8";

const buttonBase =
  "motion-safe-transition inline-flex min-h-12 items-center justify-center gap-2 rounded-[8px] px-5 py-2 text-base font-semibold no-underline";

export const buttonPrimary = `${buttonBase} bg-action text-action-fg hover:bg-action-hover`;

export const buttonSecondary = `${buttonBase} border-2 border-border bg-bg text-fg hover:border-fg`;

export const buttonQuiet = `${buttonBase} text-fg underline-offset-4 hover:underline`;

export const eyebrow = "text-sm font-semibold uppercase tracking-[0.08em] text-accent-text";

export const sectionTitle = "text-3xl font-bold tracking-tight text-balance sm:text-4xl";

export const card = "rounded-[12px] border border-border bg-bg p-6";

/** Primary action on the dark hero and the Mata-800 band: white fill, Mata-800 text (8.9:1). */
export const buttonOnDark = `${buttonBase} bg-white text-[color:var(--mata-800)] hover:bg-[color:var(--graphite-100)]`;
export const buttonOutlineOnDark = `${buttonBase} border-2 border-white/70 text-white hover:border-white hover:bg-white/10`;
