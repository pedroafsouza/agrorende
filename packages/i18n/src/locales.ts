export const SUPPORTED_LOCALES = ["pt-BR", "en"] as const;
export const DEFAULT_LOCALE = "pt-BR";
export const REQUIRED_LOCALES = ["pt-BR", "en"] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export type LocaleMeta = {
  nativeLabel: string;
  intl: string;
  dateStyle: Intl.DateTimeFormatOptions["dateStyle"];
  timeStyle: Intl.DateTimeFormatOptions["timeStyle"];
  fallback: readonly SupportedLocale[];
};

export const LOCALE_META = {
  "pt-BR": {
    nativeLabel: "Português (Brasil)",
    intl: "pt-BR",
    dateStyle: "short",
    timeStyle: "short",
    fallback: [],
  },
  en: {
    nativeLabel: "English",
    intl: "en",
    dateStyle: "medium",
    timeStyle: "short",
    fallback: ["pt-BR"],
  },
} as const satisfies Record<SupportedLocale, LocaleMeta>;

const languageAliases = new Map<string, SupportedLocale>([
  ["pt", "pt-BR"],
  ["en", "en"],
]);

function normalizeCandidate(candidate: string): string | undefined {
  const trimmed = candidate.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  const [tag] = trimmed.split(";");
  if (tag === undefined || tag.length === 0) {
    return undefined;
  }

  const parts = tag.replace("_", "-").split("-").filter(Boolean);
  const language = parts[0]?.toLowerCase();
  if (language === undefined) {
    return undefined;
  }

  const region = parts[1]?.toUpperCase();
  return region === undefined ? language : `${language}-${region}`;
}

export function resolveLocale(candidates: readonly string[]): SupportedLocale {
  const normalized = candidates.map(normalizeCandidate).filter((candidate): candidate is string => candidate !== undefined);

  for (const candidate of normalized) {
    const exactMatch = SUPPORTED_LOCALES.find((locale) => locale.toLowerCase() === candidate.toLowerCase());
    if (exactMatch !== undefined) {
      return exactMatch;
    }
  }

  for (const candidate of normalized) {
    const language = candidate.split("-")[0];
    if (language !== undefined) {
      const languageMatch = languageAliases.get(language);
      if (languageMatch !== undefined) {
        return languageMatch;
      }
    }
  }

  return DEFAULT_LOCALE;
}
