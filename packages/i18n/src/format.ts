import { formatDistance as dateFnsFormatDistance, intervalToDuration, type Duration } from "date-fns";
import { enUS, ptBR } from "date-fns/locale";
import { formatInTimeZone } from "date-fns-tz";

import { DEFAULT_LOCALE, LOCALE_META, type SupportedLocale, resolveLocale } from "./locales.js";

type DateInput = Date | number | string;
type FormatOptions = {
  timeZone?: string;
};

type DurationInput = Duration | { start: DateInput; end: DateInput } | number;

const dateFnsLocales = {
  "pt-BR": ptBR,
  en: enUS,
} as const;

function toDate(input: DateInput): Date {
  return input instanceof Date ? input : new Date(input);
}

function toLocale(locale: string | undefined): SupportedLocale {
  return locale === undefined ? DEFAULT_LOCALE : resolveLocale([locale]);
}

function intlTag(locale: SupportedLocale): string {
  return LOCALE_META[locale].intl;
}

export function formatDate(input: DateInput, locale?: string, options: FormatOptions = {}): string {
  const resolved = toLocale(locale);
  const date = toDate(input);
  if (options.timeZone !== undefined) {
    const pattern = resolved === "pt-BR" ? "dd/MM/yyyy" : "MMM d, yyyy";
    return formatInTimeZone(date, options.timeZone, pattern, { locale: dateFnsLocales[resolved] });
  }

  return new Intl.DateTimeFormat(intlTag(resolved), { dateStyle: LOCALE_META[resolved].dateStyle }).format(date);
}

export function formatDateTime(input: DateInput, locale?: string, options: FormatOptions = {}): string {
  const resolved = toLocale(locale);
  const date = toDate(input);
  if (options.timeZone !== undefined) {
    const pattern = resolved === "pt-BR" ? "dd/MM/yyyy HH:mm" : "MMM d, yyyy, h:mm a";
    return formatInTimeZone(date, options.timeZone, pattern, { locale: dateFnsLocales[resolved] });
  }

  return new Intl.DateTimeFormat(intlTag(resolved), {
    dateStyle: LOCALE_META[resolved].dateStyle,
    timeStyle: LOCALE_META[resolved].timeStyle,
  }).format(date);
}

export function formatRelative(input: DateInput, locale?: string, baseDate: DateInput = new Date()): string {
  const resolved = toLocale(locale);
  return dateFnsFormatDistance(toDate(input), toDate(baseDate), {
    addSuffix: true,
    locale: dateFnsLocales[resolved],
  });
}

export function formatNumber(value: number, locale?: string, options: Intl.NumberFormatOptions = {}): string {
  const resolved = toLocale(locale);
  return new Intl.NumberFormat(intlTag(resolved), options).format(value);
}

export function formatMoney(cents: number, currency: string, locale?: string): string {
  const resolved = toLocale(locale);
  return new Intl.NumberFormat(intlTag(resolved), {
    style: "currency",
    currency,
  }).format(cents / 100);
}

export function formatDistance(start: DateInput, end: DateInput, locale?: string): string {
  const resolved = toLocale(locale);
  return dateFnsFormatDistance(toDate(start), toDate(end), { locale: dateFnsLocales[resolved] });
}

export function formatDuration(input: DurationInput, locale?: string): string {
  const resolved = toLocale(locale);
  const duration = typeof input === "number"
    ? intervalToDuration({ start: 0, end: input })
    : "start" in input
      ? intervalToDuration({ start: toDate(input.start), end: toDate(input.end) })
      : input;

  const units = [
    ["years", "year"],
    ["months", "month"],
    ["weeks", "week"],
    ["days", "day"],
    ["hours", "hour"],
    ["minutes", "minute"],
    ["seconds", "second"],
  ] as const satisfies ReadonlyArray<readonly [keyof Duration, Intl.NumberFormatOptions["unit"]]>;
  const parts = units.flatMap((unit) => {
    const [durationUnit, intlUnit] = unit;
    const value = duration[durationUnit];
    return value === undefined || value === 0
      ? []
      : [new Intl.NumberFormat(intlTag(resolved), { style: "unit", unit: intlUnit, unitDisplay: "long" }).format(value)];
  });

  if (parts.length === 0) {
    return new Intl.NumberFormat(intlTag(resolved), { style: "unit", unit: "second", unitDisplay: "long" }).format(0);
  }

  return new Intl.ListFormat(intlTag(resolved), { style: "long", type: "conjunction" }).format(parts);
}

function validateGroupedInteger(integerPart: string, groupSeparator: string): boolean {
  if (!integerPart.includes(groupSeparator)) {
    return true;
  }

  const groups = integerPart.split(groupSeparator);
  const first = groups[0];
  if (first === undefined || first.length < 1 || first.length > 3 || !/^\d+$/.test(first)) {
    return false;
  }

  return groups.slice(1).every((group) => /^\d{3}$/.test(group));
}

export function parseLocaleNumber(input: string, locale?: string): number {
  toLocale(locale);
  const normalized = input.trim().replace(/[\s\u00A0]/g, "");
  if (!/^[+-]?\d+(?:[.,]\d+)*(?:[.,]\d+)?$/.test(normalized)) {
    return Number.NaN;
  }

  const sign = normalized.startsWith("-") ? -1 : 1;
  const unsigned = normalized.replace(/^[+-]/, "");
  const lastComma = unsigned.lastIndexOf(",");
  const lastDot = unsigned.lastIndexOf(".");

  if (lastComma === -1 && lastDot === -1) {
    return Number(unsigned) * sign;
  }

  const decimalSeparator = lastComma > lastDot ? "," : ".";
  const groupSeparator = decimalSeparator === "," ? "." : ",";
  const decimalIndex = Math.max(lastComma, lastDot);
  const integerPart = unsigned.slice(0, decimalIndex);
  const fractionPart = unsigned.slice(decimalIndex + 1);

  if (fractionPart.length === 0 || !/^\d+$/.test(fractionPart) || !validateGroupedInteger(integerPart, groupSeparator)) {
    return Number.NaN;
  }

  const hasOnlyOneSeparator = (lastComma === -1 || lastDot === -1) && unsigned.split(decimalSeparator).length === 2;
  const couldBeThousands = hasOnlyOneSeparator && fractionPart.length === 3 && integerPart.length >= 1 && integerPart.length <= 3;
  if (couldBeThousands) {
    return Number.NaN;
  }

  if (integerPart.includes(decimalSeparator)) {
    return Number.NaN;
  }

  const digits = `${integerPart.replaceAll(groupSeparator, "")}.${fractionPart}`;
  return Number(digits) * sign;
}
