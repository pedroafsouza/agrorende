/**
 * Realtime service URL resolved at run time (change request T18-003).
 *
 * `next build` inlines `process.env.NEXT_PUBLIC_REALTIME_URL` in client code, so one image could
 * not serve staging and production. The root layout reads the variable on the server at request
 * time and renders it in `<meta name="agrorende-realtime-url">`; the browser reads that tag. The
 * inlined build-time value and the local default stay as fallbacks for tests and `pnpm dev`.
 */

export const REALTIME_URL_META = "agrorende-realtime-url";
export const DEFAULT_REALTIME_URL = "http://localhost:4001";
const REALTIME_URL_ENV = "NEXT_PUBLIC_REALTIME_URL";

function httpUrl(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim() ?? "";
  return /^https?:\/\/[^\s"'<>]+$/u.test(trimmed) ? trimmed : undefined;
}

/** Server side: the variable is looked up by a computed key so the bundler cannot inline it. */
export function serverRealtimeUrl(env: Readonly<Record<string, string | undefined>> = process.env): string {
  return httpUrl(env[REALTIME_URL_ENV]) ?? DEFAULT_REALTIME_URL;
}

/** Browser side: the server-rendered meta tag wins over the build-time value. */
export function clientRealtimeUrl(doc: Pick<Document, "querySelector"> | undefined = typeof document === "undefined" ? undefined : document): string {
  const fromMeta = doc?.querySelector<HTMLMetaElement>(`meta[name="${REALTIME_URL_META}"]`)?.content;
  return httpUrl(fromMeta) ?? httpUrl(process.env.NEXT_PUBLIC_REALTIME_URL) ?? DEFAULT_REALTIME_URL;
}
