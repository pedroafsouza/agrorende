import { z } from "zod";

/**
 * The locale registry lives in `@agrorende/i18n`, but `@agrorende/contracts`
 * depends on nothing except zod (ARCHITECTURE §4), so the supported locale list
 * is mirrored here. `pnpm i18n:check` fails when the two lists diverge.
 */
export const SUPPORTED_LOCALES = ["pt-BR", "en"] as const;
export const DEFAULT_LOCALE = "pt-BR" as const;
export const REQUIRED_LOCALES = ["pt-BR", "en"] as const;

export const LocaleSchema = z.enum(SUPPORTED_LOCALES);
export type Locale = z.infer<typeof LocaleSchema>;

/**
 * Localized free text. Every locale in REQUIRED_LOCALES must be present and
 * non-empty; additional supported locales are optional.
 */
export const LocalizedTextSchema = z
  .record(LocaleSchema, z.string().min(1))
  .superRefine((value, ctx) => {
    for (const locale of REQUIRED_LOCALES) {
      const text = value[locale];
      if (text === undefined || text.trim().length === 0) {
        ctx.addIssue({
          code: "custom",
          message: `Missing required locale "${locale}".`,
          path: [locale],
        });
      }
    }
  });
export type LocalizedText = z.infer<typeof LocalizedTextSchema>;

/**
 * Resolves localized text for a locale using the fallback chain
 * requested locale -> en -> pt-BR -> any present locale.
 */
export function pickText(text: LocalizedText, locale: Locale): string {
  const chain: readonly Locale[] = [locale, "en", DEFAULT_LOCALE];
  for (const candidate of chain) {
    const value = text[candidate];
    if (value !== undefined && value.length > 0) {
      return value;
    }
  }
  for (const value of Object.values(text)) {
    if (value !== undefined && value.length > 0) {
      return value;
    }
  }
  return "";
}

export const E164Schema = z.string().regex(/^\+[1-9]\d{1,14}$/);
export type E164 = z.infer<typeof E164Schema>;

export const SlaHoursSchema = z.object({
  CRITICAL: z.number().default(4),
  HIGH: z.number().default(24),
  MEDIUM: z.number().default(72),
  LOW: z.number().default(168),
});

export const OrgMediaSettingsSchema = z.object({
  videoMaxSeconds: z.number().default(60),
  maxVideosPerReport: z.number().default(5),
  audioMaxSeconds: z.number().default(120),
  photoMaxPx: z.number().default(2048),
  photoQuality: z.number().default(0.8),
});

export const OrgLocationSettingsSchema = z.object({
  intervalSec: z.number().default(15),
  distanceM: z.number().default(25),
});

export const OnboardingStepsSchema = z.object({
  assets: z.boolean().default(false),
  team: z.boolean().default(false),
  qr: z.boolean().default(false),
  app: z.boolean().default(false),
});

export const OnboardingSchema = z
  .object({
    dismissedAt: z.string().datetime().optional(),
    steps: OnboardingStepsSchema,
  })
  .default({ steps: { assets: false, team: false, qr: false, app: false } });

export const RentalTermsSchema = z.object({
  version: z.number().int(),
  text: LocalizedTextSchema,
});

export const OrgSettingsSchema = z.object({
  slaHours: SlaHoursSchema,
  /** At risk when less than this ratio of the SLA window remains. */
  slaAtRiskRatio: z.number().default(0.25),
  requireWoSignature: z.boolean().default(true),
  rentalGraceHours: z.number().default(2),
  rentalDueSoonHours: z.number().default(24),
  rentalTerms: RentalTermsSchema,
  /** Used by "Ask the office". */
  officePhone: E164Schema,
  officeWhatsApp: E164Schema.optional(),
  defaultSiteRadiusM: z.number().default(200),
  media: OrgMediaSettingsSchema,
  location: OrgLocationSettingsSchema,
  staleSyncAlertHours: z.number().default(24),
  showLaborCostToManager: z.boolean().default(true),
  onboarding: OnboardingSchema,
});
export type OrgSettings = z.infer<typeof OrgSettingsSchema>;
