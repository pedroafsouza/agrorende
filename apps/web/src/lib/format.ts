import { formatInTimeZone } from "date-fns-tz";

export const DEFAULT_TIME_ZONE = "America/Sao_Paulo";

export function formatMoney(cents: number | null | undefined, locale: string, currency = "BRL"): string {
  if (cents === null || cents === undefined) return "";
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100);
}

/** Parses "1.234,56" (pt-BR) or "1,234.56" (en) into integer cents; null when unparseable. */
export function parseMoneyToCents(value: string, locale: string): number | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  const decimal = locale.startsWith("pt") ? "," : ".";
  const cleaned = trimmed.replace(/[^\d,.-]/gu, "");
  const normalized = decimal === "," ? cleaned.replace(/\./gu, "").replace(",", ".") : cleaned.replace(/,/gu, "");
  const number = Number(normalized);
  return Number.isFinite(number) ? Math.round(number * 100) : null;
}

export function formatDateTime(iso: string | null | undefined, locale: string, timeZone = DEFAULT_TIME_ZONE): string {
  if (iso === null || iso === undefined) return "";
  return formatInTimeZone(new Date(iso), timeZone, locale.startsWith("pt") ? "dd/MM/yyyy HH:mm" : "MMM d, yyyy h:mm a");
}

export function formatDate(day: string | null | undefined, locale: string): string {
  if (day === null || day === undefined || day.length === 0) return "";
  const [y, m, d] = day.slice(0, 10).split("-");
  return locale.startsWith("pt") ? `${d ?? ""}/${m ?? ""}/${y ?? ""}` : `${m ?? ""}/${d ?? ""}/${y ?? ""}`;
}

export function formatNumber(value: number | null | undefined, locale: string, digits = 0): string {
  if (value === null || value === undefined) return "";
  return new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(value);
}

/** CPF `000.000.000-00` / CNPJ `00.000.000/0000-00` display mask for any partial input. */
export function maskTaxId(raw: string): string {
  const digits = raw.replace(/\D/gu, "").slice(0, 14);
  if (digits.length <= 11) {
    return digits
      .replace(/^(\d{3})(\d)/u, "$1.$2")
      .replace(/^(\d{3})\.(\d{3})(\d)/u, "$1.$2.$3")
      .replace(/\.(\d{3})(\d{1,2})$/u, ".$1-$2");
  }
  return digits
    .replace(/^(\d{2})(\d)/u, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/u, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/u, ".$1/$2")
    .replace(/(\d{4})(\d{1,2})$/u, "$1-$2");
}
