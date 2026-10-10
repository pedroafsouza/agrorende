import { randomUUID } from "node:crypto";

import type { ChecklistItem } from "@agrorende/contracts/checklist";
import type { OrgSettings } from "@agrorende/contracts/settings";
import type { ChecklistTemplate, NumberSequence } from "@agrorende/db";

import { SEQUENCE_KEYS } from "./config";

type Localized = { "pt-BR": string; en: string };

function text(pt: string, en: string): Localized {
  return { "pt-BR": pt, en };
}

/** Default `Organization.settings` for a new company (same values as the demo seed, ARCHITECTURE §5.3). */
export function defaultOrgSettings(officePhone: string): OrgSettings {
  return {
    slaHours: { CRITICAL: 4, HIGH: 24, MEDIUM: 72, LOW: 168 },
    slaAtRiskRatio: 0.25,
    requireWoSignature: true,
    rentalGraceHours: 2,
    rentalDueSoonHours: 24,
    rentalTerms: {
      version: 1,
      text: text(
        "O locatário recebe o equipamento nas condições registradas na vistoria de saída e se compromete a devolvê-lo no prazo combinado, nas mesmas condições, respondendo por danos e acessórios faltantes.",
        "The customer receives the equipment in the condition recorded at the checkout inspection and agrees to return it on the agreed date in the same condition, answering for damage and missing accessories.",
      ),
    },
    officePhone,
    officeWhatsApp: officePhone,
    defaultSiteRadiusM: 200,
    media: { videoMaxSeconds: 60, maxVideosPerReport: 5, audioMaxSeconds: 120, photoMaxPx: 2048, photoQuality: 0.8 },
    location: { intervalSec: 15, distanceM: 25 },
    staleSyncAlertHours: 24,
    showLaborCostToManager: true,
    onboarding: { steps: { assets: false, team: false, qr: false, app: false } },
  };
}

function item(key: string, pt: string, en: string, extra: Partial<ChecklistItem> = {}): ChecklistItem {
  return { key, label: text(pt, en), type: "PASS_FAIL_NA", required: true, isSafetyCritical: false, photo: "NEVER", ...extra };
}

const RENTAL_ITEMS: readonly ChecklistItem[] = [
  item("hour_meter", "Horímetro", "Hour meter", { type: "NUMBER", unit: "h", photo: "ALWAYS" }),
  item("fuel_level", "Nível de combustível", "Fuel level", { photo: "ALWAYS" }),
  item("tyres", "Pneus", "Tyres"),
  item("lights", "Luzes e sinalização", "Lights and signals", { isSafetyCritical: true }),
  item("brakes", "Freios", "Brakes", { isSafetyCritical: true }),
  item("leaks", "Vazamentos", "Leaks", { photo: "ON_FAIL" }),
  item("bodywork", "Lataria e cabine", "Bodywork and cab", { photo: "ON_FAIL" }),
  item("cleanliness", "Limpeza", "Cleanliness", { required: false }),
];

const WORK_ORDER_ITEMS: readonly ChecklistItem[] = [
  item("safety_lockout", "Equipamento travado e seguro", "Equipment locked out and safe", { isSafetyCritical: true }),
  item("fault_confirmed", "Defeito confirmado", "Fault confirmed"),
  item("repair_done", "Reparo executado", "Repair done", { photo: "ALWAYS" }),
  item("test_run", "Teste de funcionamento", "Test run"),
  item("area_clean", "Área limpa e ferramentas recolhidas", "Area clean and tools collected", { required: false }),
];

/** Default checklist templates created with every new company (TEN-01). */
export function defaultChecklistTemplates(organizationId: string, syncVersion: number, now: Date, locale: string): ChecklistTemplate[] {
  const en = locale.startsWith("en");
  const template = (name: string, appliesTo: ChecklistTemplate["appliesTo"], items: readonly ChecklistItem[]): ChecklistTemplate => ({
    _id: randomUUID(),
    organizationId,
    syncVersion,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    name,
    appliesTo,
    assetCategories: [],
    templateVersion: 1,
    items: [...items],
    accessories: [],
    isActive: true,
    archivedAt: null,
  });
  return [
    template(en ? "Rental — standard inspection" : "Locação — vistoria padrão", ["RENTAL"], RENTAL_ITEMS),
    template(en ? "Standard corrective service" : "Serviço corretivo padrão", ["WORK_ORDER"], WORK_ORDER_ITEMS),
  ];
}

/** One `number_sequences` row per key (FR, WO, RN, BD, AGR), created with the organisation. */
export function defaultSequences(organizationId: string): NumberSequence[] {
  return SEQUENCE_KEYS.map((key) => ({ _id: `${organizationId}:${key}`, organizationId, key, value: 0 }));
}
