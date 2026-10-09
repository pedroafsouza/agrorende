import localFont from "next/font/local";

/**
 * Self-hosted Geist (ARCHITECTURE §3.7 and §26) from the `geist` package, under the SIL Open Font
 * License (OFL.txt). The variable fonts are subset to Latin (about 33 KB instead of 70 KB each); every
 * character of the pt-BR and en copy is covered, and `test/fonts.test.ts` keeps it that way. See
 * docs/SITE.md for the `pyftsubset` command. Only Sans is preloaded: Mono appears in codes below the fold, so
 * preloading it would compete with the CSS and the hero for bandwidth on slow mobile networks.
 */
export const geistSans = localFont({
  src: "./Geist-Variable-latin.woff2",
  variable: "--font-geist-sans",
  weight: "100 900",
  display: "swap",
  preload: true,
  adjustFontFallback: "Arial",
});

export const geistMono = localFont({
  src: "./GeistMono-Variable-latin.woff2",
  variable: "--font-geist-mono",
  weight: "100 900",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
});
