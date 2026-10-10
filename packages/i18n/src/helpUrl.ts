import { DEFAULT_LOCALE, resolveLocale } from "./locales";

function kebabCode(code: string): string {
  return code.trim().toLowerCase().replace(/_/g, "-");
}

export function helpUrl(code: string, locale: string = DEFAULT_LOCALE): string {
  const resolved = resolveLocale([locale]);
  const slug = kebabCode(code);
  return resolved === "en" ? `/en/help/errors/${slug}` : `/pt-br/ajuda/erros/${slug}`;
}
