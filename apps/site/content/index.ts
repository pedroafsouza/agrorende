import type { SiteLocale } from "../src/lib/locales";
import { dpa as dpaEn } from "./en/dpa";
import { privacy as privacyEn } from "./en/privacy";
import { terms as termsEn } from "./en/terms";
import { dpa as dpaPt } from "./pt-br/dpa";
import { privacy as privacyPt } from "./pt-br/privacy";
import { terms as termsPt } from "./pt-br/terms";
import type { LegalDocument, LegalDocumentKey } from "./types";

export type { LegalDocument, LegalDocumentKey, LegalSection } from "./types";

export const LEGAL_CONTENT: Record<SiteLocale, Record<LegalDocumentKey, LegalDocument>> = {
  "pt-br": { privacy: privacyPt, terms: termsPt, dpa: dpaPt },
  en: { privacy: privacyEn, terms: termsEn, dpa: dpaEn },
};
