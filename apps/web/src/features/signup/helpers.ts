export const EXPECTED_FIELD_USERS = ["1-5", "6-20", "21-50+"] as const;
export type ExpectedFieldUsers = (typeof EXPECTED_FIELD_USERS)[number];

export const BRAZIL_TIMEZONES = [
  "America/Sao_Paulo",
  "America/Bahia",
  "America/Fortaleza",
  "America/Recife",
  "America/Belem",
  "America/Araguaina",
  "America/Maceio",
  "America/Santarem",
  "America/Cuiaba",
  "America/Campo_Grande",
  "America/Manaus",
  "America/Porto_Velho",
  "America/Boa_Vista",
  "America/Rio_Branco",
  "America/Noronha",
] as const;

export const BRAZIL_STATES = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"] as const;

/** The browser's zone when it is a Brazilian one, otherwise São Paulo (TEN-01 default). */
export function defaultTimezone(browserZone: string | undefined): string {
  return BRAZIL_TIMEZONES.find((zone) => zone === browserZone) ?? "America/Sao_Paulo";
}

/** Accepts `+55 11 91234-5678`, `(11) 91234-5678` or `11912345678`; national numbers get +55. */
export function toE164(raw: string): string {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 0) return "";
  if (trimmed.startsWith("+")) return `+${digits}`;
  if (digits.startsWith("55") && digits.length >= 12) return `+${digits}`;
  return `+55${digits.replace(/^0+/, "")}`;
}

/** Only same-origin paths or the AgroRende app scheme are followed after sign-up. */
export function safeRedirect(target: string | null | undefined): string {
  if (target === null || target === undefined) return "/ops";
  if (target.startsWith("/") && !target.startsWith("//")) return target;
  if (/^agrorende:\/\//i.test(target)) return target;
  return "/ops";
}

export interface CompanyFormValues {
  readonly name: string;
  readonly officePhone: string;
  readonly taxId: string;
  readonly city: string;
  readonly state: string;
  readonly timezone: string;
  readonly locale: "pt-BR" | "en";
  readonly expectedFieldUsers: ExpectedFieldUsers;
  readonly acceptTerms: boolean;
}

export function signupBody(ticket: string, values: CompanyFormValues) {
  const optional = (value: string) => (value.trim().length === 0 ? undefined : value.trim());
  return {
    ticket,
    name: values.name.trim(),
    officePhone: toE164(values.officePhone),
    taxId: optional(values.taxId),
    city: optional(values.city),
    state: optional(values.state),
    timezone: values.timezone,
    locale: values.locale,
    expectedFieldUsers: values.expectedFieldUsers,
    acceptTerms: values.acceptTerms,
  };
}

const SIGNUP_FIELD_CODES = new Set(["cnpj_invalid", "timezone_invalid", "too_small", "too_big", "invalid_type", "invalid_string", "invalid_format", "invalid_literal", "invalid_value"]);

/** Maps a server field error code to a `signup.fieldErrors.*` key. */
export function signupFieldErrorKey(path: string, code: string): string {
  if (path === "acceptTerms") return "terms_required";
  if (path === "officePhone") return "phone_invalid";
  return SIGNUP_FIELD_CODES.has(code) ? code : "invalid";
}
