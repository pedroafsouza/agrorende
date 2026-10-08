import { upsertMirrorRow } from "../../src/db/mirror";
import type { SqlDb } from "../../src/db/sql";
import type { MediaDraft } from "../../src/components/MediaCapture/drafts";
import { testId } from "./runtime";

export const ORG_ID = "01900000-0000-7000-8000-00000000f000";

export interface RentalSeed {
  readonly rentalId: string;
  readonly assetId: string;
  readonly customerId: string;
  readonly templateId: string;
}

export interface RentalSeedOptions {
  readonly status?: "RESERVED" | "ACTIVE";
  readonly plannedStart?: string;
  readonly plannedEnd?: string;
  readonly extra?: Record<string, unknown>;
  readonly withTemplate?: boolean;
}

/** One rentable tractor with a 300 L tank, a customer, the organisation and a RENTAL checklist template. */
export async function seedRental(db: SqlDb, options: RentalSeedOptions = {}): Promise<RentalSeed> {
  const ids: RentalSeed = { rentalId: testId(), assetId: testId(), customerId: testId(), templateId: testId() };
  const iso = "2026-03-01T00:00:00.000Z";
  const base = { organizationId: ORG_ID, syncVersion: 1, createdAt: iso, updatedAt: iso, deletedAt: null };
  await upsertMirrorRow(
    db,
    "organization",
    { id: ORG_ID, name: "Fazenda Boa Vista", timezone: "America/Sao_Paulo", locale: "pt-BR", currency: "BRL", settings: { rentalGraceHours: 2, rentalTerms: { version: 3, text: { "pt-BR": "Termos de locação", en: "Rental terms" } } }, syncVersion: 1, createdAt: iso, updatedAt: iso },
    0,
  );
  await upsertMirrorRow(db, "assets", { ...base, id: ids.assetId, code: "TR-9", name: "Trator 9", category: "TRACTOR", condition: "OPERATIONAL", isRentable: true, tankCapacityL: 300, hourMeter: 4312, currentRentalId: null }, 0);
  await upsertMirrorRow(db, "customers", { ...base, id: ids.customerId, name: "Agro Silva Ltda", taxIdType: "CNPJ", taxId: "12345678000195", taxIdMasked: "12.***.***/0001-95", phone: "+5561999990000", archivedAt: null }, 0);
  if (options.withTemplate !== false) {
    await upsertMirrorRow(
      db,
      "checklistTemplates",
      {
        ...base,
        id: ids.templateId,
        name: "Entrega de trator",
        appliesTo: ["RENTAL"],
        assetCategories: ["TRACTOR"],
        templateVersion: 2,
        items: [{ key: "tires", label: { "pt-BR": "Pneus", en: "Tyres" }, type: "PASS_FAIL_NA", required: true, isSafetyCritical: false, photo: "NEVER" }],
        accessories: [{ accessoryKey: "toolkit", label: { "pt-BR": "Caixa de ferramentas", en: "Toolkit" }, defaultQty: 1, replacementCostCents: 30000 }],
        isActive: true,
        archivedAt: null,
      },
      0,
    );
  }
  await upsertMirrorRow(
    db,
    "rentals",
    {
      ...base,
      id: ids.rentalId,
      number: "LOC-12",
      direction: "OUTBOUND",
      status: options.status ?? "RESERVED",
      assetId: ids.assetId,
      customerId: ids.customerId,
      customerSnapshot: { name: "Agro Silva Ltda", taxIdMasked: "12.***.***/0001-95" },
      plannedStart: options.plannedStart ?? "2026-03-01T11:00:00.000Z",
      plannedEnd: options.plannedEnd ?? "2026-03-05T11:00:00.000Z",
      actualStart: null,
      actualEnd: null,
      rateCents: 85000,
      rateUnit: "DAY",
      depositCents: 200000,
      includedHoursPerDay: 8,
      extraHourRateCents: 12000,
      fuelPolicy: "CHARGE_DIFFERENCE",
      fuelPriceCents: 620,
      documentLocale: "pt-BR",
      checkOutInspectionId: null,
      checkInInspectionId: null,
      ...options.extra,
    },
    0,
  );
  return ids;
}

export function photo(inspectionId: string, tag: string, extra: Partial<MediaDraft> = {}): MediaDraft {
  const id = testId();
  return { id, kind: "PHOTO", tag, mimeType: "image/jpeg", capturedAt: "2026-03-01T12:00:00.000Z", parent: { type: "INSPECTION", id: inspectionId }, localUri: `file:///docs/${id}.jpg`, ...extra };
}
