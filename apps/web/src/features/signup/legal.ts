/** Legal pages on the public site (T21). Paths are an assumption recorded in docs/progress/T20.md. */
export function legalUrls(siteUrl: string | undefined, locale: string): { termsUrl: string; privacyUrl: string; dpaUrl: string } {
  const base = (siteUrl ?? "http://localhost:3300").replace(/\/$/, "");
  return locale === "en"
    ? { termsUrl: `${base}/en/terms`, privacyUrl: `${base}/en/privacy`, dpaUrl: `${base}/en/dpa` }
    : { termsUrl: `${base}/pt-br/termos`, privacyUrl: `${base}/pt-br/privacidade`, dpaUrl: `${base}/pt-br/dpa` };
}
