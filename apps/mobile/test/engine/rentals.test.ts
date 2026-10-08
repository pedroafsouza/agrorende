import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { computeRentalCharges, summarizeRentalCharges, validateCheckIn, validateCheckOut } from "@agrorende/contracts/charges";
import { RentalCheckinPayloadSchema, RentalCheckoutPayloadSchema } from "@agrorende/contracts/mutations";

import { getMirrorRow } from "../../src/db/mirror";
import {
  buildCheckinPayload,
  buildCheckoutPayload,
  chargesInputFor,
  chargesPreview,
  displayTaxId,
  guardDraft,
  isOverdue,
  listOpenRentals,
  loadInspectionContext,
  missingSteps,
  newInspectionDraft,
  sectionCounts,
  sectionRentals,
  validateAccessories,
  validateReadings,
  validateSignatures,
  validationArgs,
  WALKAROUND_TAGS,
  zonedIso,
  type InspectionContext,
  type InspectionDraft,
  type RentalSummary,
} from "../../src/features/rentals/logic";
import { listOutbox } from "../../src/sync/outbox";
import { checkinRental, checkoutRental } from "../../src/sync/mutators/rentals";
import { photo, seedRental } from "../helpers/rentals";
import { createTestRuntime, testId } from "../helpers/runtime";

const NOW_MS = Date.parse("2026-03-01T12:00:00.000Z");

/** A check-out draft with every required item: walkaround, readings, checklist, briefing, terms and both signatures. */
function completeCheckout(ctx: InspectionContext): InspectionDraft {
  const base = newInspectionDraft(ctx, { inspectionId: testId(), templateId: testId() });
  const id = base.inspectionId;
  return {
    ...base,
    identityConfirmed: true,
    media: [...WALKAROUND_TAGS.map((tag) => photo(id, tag)), photo(id, "HOUR_METER"), photo(id, "FUEL_GAUGE")],
    hourMeter: 4312,
    fuelPercent: 100,
    responses: [{ key: "tires", value: "PASS", answeredAt: "2026-03-01T12:00:00.000Z" }],
    safetyBriefingGiven: true,
    operatorName: "João Operador",
    termsAccepted: true,
    signatureStatus: "SIGNED",
    signerName: "Maria Silva",
    signerRole: "CUSTOMER",
    customerSignature: photo(id, "SIGNATURE_CUSTOMER", { kind: "SIGNATURE", mimeType: "image/png" }),
    agentSignature: photo(id, "SIGNATURE_AGENT", { kind: "SIGNATURE", mimeType: "image/png" }),
  };
}

async function checkoutContext() {
  const test = await createTestRuntime();
  const seed = await seedRental(test.runtime.db);
  const ctx = await loadInspectionContext(test.runtime.db, seed.rentalId, "CHECK_OUT");
  if (ctx === undefined) throw new Error("context");
  return { ...test, seed, ctx };
}

describe("rental check-out guard (offline, same validator as the server)", () => {
  test("a complete draft passes the schema and validateCheckOut", async () => {
    const { ctx } = await checkoutContext();
    expect(ctx.template?.items).toHaveLength(1);
    expect(ctx.settings.termsVersion).toBe(3);
    const draft = completeCheckout(ctx);
    expect(missingSteps(draft, ctx, NOW_MS)).toEqual([]);
    const payload = buildCheckoutPayload(draft);
    expect(RentalCheckoutPayloadSchema.safeParse(payload).success).toBe(true);
    expect(validateCheckOut(...validationArgs("CHECK_OUT", payload.inspection, ctx)).ok).toBe(true);
    expect(guardDraft(draft, ctx)).toBe(true);
    expect(payload.inspection.media.every((item) => item.parent.type === "INSPECTION" && item.parent.id === draft.inspectionId)).toBe(true);
  });

  test("GUARD_CHECKOUT_INCOMPLETE: each gap is reported against its wizard step", async () => {
    const { ctx } = await checkoutContext();
    const full = completeCheckout(ctx);
    const draft: InspectionDraft = { ...full, media: full.media.filter((item) => item.tag !== "WALKAROUND_CAB"), termsAccepted: false, safetyBriefingGiven: false };
    expect(missingSteps(draft, ctx, NOW_MS).map((gap) => gap.step)).toEqual(["walkaround", "briefing", "terms"]);
    expect(guardDraft(draft, ctx)).toBe(false);
    const result = validateCheckOut(...validationArgs("CHECK_OUT", buildCheckoutPayload(draft).inspection, ctx));
    expect(result.ok).toBe(false);
  });

  test("METER_READING_LOWER blocks readings unless the meter was replaced", async () => {
    const { ctx } = await checkoutContext();
    const draft = { ...completeCheckout(ctx), hourMeter: 4000 };
    expect(validateReadings(draft, ctx, NOW_MS)).toBe("errors.METER_READING_LOWER.title");
    expect(validateReadings({ ...draft, meterReplaced: true }, ctx, NOW_MS)).toBe(true);
  });

  test("missing accessory needs a note; REFUSED signature needs a reason", async () => {
    const { ctx } = await checkoutContext();
    const draft = completeCheckout(ctx);
    expect(validateAccessories({ ...draft, accessories: [{ accessoryKey: "toolkit", expected: 1, present: 0 }] })).toBe("rentals.wizard.accessories.noteRequired");
    expect(validateAccessories({ ...draft, accessories: [{ accessoryKey: "toolkit", expected: 1, present: 0, missingReason: "Ficou no galpão" }] })).toBe(true);
    const checkin: InspectionDraft = { ...draft, kind: "CHECK_IN", customerSignature: undefined, signatureStatus: "REFUSED" };
    expect(validateSignatures(checkin)).toBe("rentals.wizard.signatures.reasonRequired");
    expect(validateSignatures({ ...checkin, signatureReason: "Cliente não quis assinar" })).toBe(true);
  });
});

describe("rental mutators (optimistic, offline)", () => {
  test("rental.checkout marks the rental ACTIVE and the asset rented, then rental.checkin returns it", async () => {
    const { runtime, seed, ctx } = await checkoutContext();
    const out = completeCheckout(ctx);
    await checkoutRental(buildCheckoutPayload(out), { runtime });
    expect((await getMirrorRow(runtime.db, "rentals", seed.rentalId))?.status).toBe("ACTIVE");
    expect((await getMirrorRow(runtime.db, "rentals", seed.rentalId))?.checkOutInspectionId).toBe(out.inspectionId);
    expect((await getMirrorRow(runtime.db, "assets", seed.assetId))?.currentRentalId).toBe(seed.rentalId);
    expect((await getMirrorRow(runtime.db, "inspections", out.inspectionId))?.type).toBe("CHECK_OUT");

    const inCtx = await loadInspectionContext(runtime.db, seed.rentalId, "CHECK_IN");
    if (inCtx === undefined) throw new Error("context");
    expect(inCtx.checkOut?.hourMeter).toBe(4312);
    expect(inCtx.baselineHourMeter).toBe(4312);
    const base = newInspectionDraft(inCtx, { inspectionId: testId(), templateId: testId() });
    expect(base.templateSnapshot).toEqual(out.templateSnapshot);
    const damageId = testId();
    const back: InspectionDraft = {
      ...base,
      identityConfirmed: true,
      media: [...WALKAROUND_TAGS.map((tag) => photo(base.inspectionId, tag)), photo(base.inspectionId, "HOUR_METER"), photo(base.inspectionId, "FUEL_GAUGE"), photo(base.inspectionId, "DAMAGE", { damageId })],
      hourMeter: 4320,
      fuelPercent: 90,
      responses: [{ key: "tires", value: "PASS", answeredAt: "2026-03-01T12:00:00.000Z" }],
      damages: [{ id: damageId, zone: "LEFT", severity: "MINOR", isPreExisting: false, matchStatus: "NEW", estimatedCostCents: 50000 }],
      signatureStatus: "ABSENT",
      signatureReason: "Cliente ausente na devolução",
      agentSignature: photo(base.inspectionId, "SIGNATURE_AGENT", { kind: "SIGNATURE", mimeType: "image/png" }),
    };
    expect(missingSteps(back, inCtx, Date.parse("2026-03-01T14:00:00.000Z"))).toEqual([{ step: "readings", reason: "errors.METER_READING_JUMP.title" }]);
    const nowMs = Date.parse("2026-03-01T22:00:00.000Z");
    expect(missingSteps(back, inCtx, nowMs)).toEqual([]);
    const payload = buildCheckinPayload(back);
    expect(RentalCheckinPayloadSchema.safeParse(payload).success).toBe(true);
    expect(payload.damageCosts).toEqual([{ damageId, estimatedCostCents: 50000 }]);
    expect(validateCheckIn(...validationArgs("CHECK_IN", payload.inspection, inCtx)).ok).toBe(true);
    await checkinRental(payload, { runtime });
    expect((await getMirrorRow(runtime.db, "rentals", seed.rentalId))?.status).toBe("RETURNED");
    expect((await getMirrorRow(runtime.db, "assets", seed.assetId))?.currentRentalId).toBeNull();
    expect((await listOutbox(runtime.db)).map((row) => row.name)).toEqual(["rental.checkout", "rental.checkin"]);
  });
});

describe("rental charges preview", () => {
  test("V1 vector: the device preview equals computeRentalCharges (total 1 069 900, balance 869 900)", () => {
    const ctx: InspectionContext = {
      kind: "CHECK_IN",
      rentalId: testId(),
      rentalNumber: "LOC-1",
      status: "ACTIVE",
      direction: "OUTBOUND",
      assetId: testId(),
      assetCode: "TR-1",
      assetName: "Trator",
      category: "TRACTOR",
      tankCapacityL: 300,
      baselineHourMeter: 4312,
      openDamages: [],
      template: undefined,
      customerName: "Cliente",
      documentLocale: "pt-BR",
      settings: { timeZone: "America/Sao_Paulo", graceHours: 2, currency: "BRL", termsVersion: null, termsText: null },
      checkOut: { hourMeter: 4312, fuelPercent: 100, accessories: [], responses: [], templateId: null, templateVersion: null, templateSnapshot: [], media: [] },
      charges: {
        rateCents: 85000,
        rateUnit: "DAY",
        plannedStart: "2026-11-01T08:00:00.000Z",
        plannedEnd: "2026-11-11T08:00:00.000Z",
        actualStart: "2026-11-01T08:00:00.000Z",
        lateFeePerDayCents: null,
        includedHoursPerDay: 8,
        extraHourRateCents: 12000,
        fuelPolicy: "CHARGE_DIFFERENCE",
        fuelPriceCents: 620,
        depositCents: 200000,
      },
    };
    const draft: InspectionDraft = {
      ...newInspectionDraft(ctx, { inspectionId: testId(), templateId: testId() }),
      hourMeter: 4398,
      fuelPercent: 85,
      damages: [{ id: testId(), zone: "FRONT", severity: "MODERATE", isPreExisting: false, matchStatus: "NEW", estimatedCostCents: 120000 }],
    };
    const returnedAt = Date.parse("2026-11-11T09:30:00.000Z");
    const preview = chargesPreview(ctx, draft, returnedAt);
    const input = chargesInputFor(ctx, draft, returnedAt);
    expect(preview.lines).toEqual(computeRentalCharges(input));
    expect(preview).toEqual(summarizeRentalCharges(input));
    expect(preview.totalCents).toBe(1069900);
    expect(preview.balanceDueCents).toBe(869900);
  });
});

describe("rentals tab sections", () => {
  function row(id: string, status: "RESERVED" | "ACTIVE", plannedStart: string, plannedEnd: string): RentalSummary {
    return { id, number: id, status, direction: "OUTBOUND", assetId: "a", assetName: "Trator", assetCode: null, customerName: "C", plannedStart, plannedEnd, actualStart: null, actualEnd: null, pending: false };
  }

  test("hand-overs today, returns today, overdue after grace, active and upcoming", () => {
    const tz = "America/Sao_Paulo";
    const rows = [
      row("handover", "RESERVED", "2026-03-01T13:00:00.000Z", "2026-03-04T13:00:00.000Z"),
      row("upcoming", "RESERVED", "2026-03-03T13:00:00.000Z", "2026-03-04T13:00:00.000Z"),
      row("return", "ACTIVE", "2026-02-25T13:00:00.000Z", "2026-03-01T20:00:00.000Z"),
      row("overdue", "ACTIVE", "2026-02-20T13:00:00.000Z", "2026-03-01T09:00:00.000Z"),
      row("grace", "ACTIVE", "2026-02-20T13:00:00.000Z", "2026-03-01T10:30:00.000Z"),
      row("active", "ACTIVE", "2026-02-20T13:00:00.000Z", "2026-03-09T13:00:00.000Z"),
    ];
    const sections = sectionRentals(rows, NOW_MS, tz, 2);
    expect(sections.handOvers.map((r) => r.id)).toEqual(["handover"]);
    expect(sections.upcoming.map((r) => r.id)).toEqual(["upcoming"]);
    expect(sections.returns.map((r) => r.id)).toEqual(["return", "grace"]);
    expect(sections.overdue.map((r) => r.id)).toEqual(["overdue"]);
    expect(sections.active.map((r) => r.id)).toEqual(["active"]);
    expect(sectionCounts(sections)).toEqual({ handOvers: 1, returns: 2, overdue: 1 });
    expect(isOverdue("2026-03-01T09:00:00.000Z", NOW_MS, 2)).toBe(true);
    expect(isOverdue("2026-03-01T10:30:00.000Z", NOW_MS, 2)).toBe(false);
  });

  test("open rentals come from the local mirror with asset and customer names", async () => {
    const { runtime } = await createTestRuntime();
    await seedRental(runtime.db);
    const rows = await listOpenRentals(runtime.db);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ assetName: "Trator 9", customerName: "Agro Silva Ltda", status: "RESERVED" });
  });

  test("FIELD sees the masked CPF/CNPJ, office roles the full one (T08.17)", () => {
    const customer = { taxId: "12345678000195", taxIdMasked: "12.***.***/0001-95" };
    expect(displayTaxId("FIELD", customer, null)).toBe("12.***.***/0001-95");
    expect(displayTaxId("ADMIN", customer, null)).not.toBe("12.***.***/0001-95");
  });

  test("zonedIso reads dates in the organisation timezone", () => {
    expect(zonedIso("2026-11-01", 8, "America/Sao_Paulo")).toBe("2026-11-01T11:00:00.000Z");
    expect(zonedIso("2026-11-01", 8, "UTC")).toBe("2026-11-01T08:00:00.000Z");
    expect(zonedIso("01/11/2026", 8, "UTC")).toBeUndefined();
  });
});

describe("rentals i18n", () => {
  type Tree = { readonly [key: string]: string | Tree };
  const dir = join(__dirname, "..", "..", "src", "i18n");
  function flatten(tree: Tree, prefix = "", out = new Set<string>()): Set<string> {
    for (const [key, value] of Object.entries(tree)) {
      const path = prefix.length === 0 ? key : `${prefix}.${key}`;
      if (typeof value === "string") out.add(path);
      else flatten(value, path, out);
    }
    return out;
  }
  const pt = flatten(JSON.parse(readFileSync(join(dir, "pt-BR", "rentals.json"), "utf8")) as Tree);
  const en = flatten(JSON.parse(readFileSync(join(dir, "en", "rentals.json"), "utf8")) as Tree);

  function files(path: string, out: string[] = []): string[] {
    for (const entry of readdirSync(path)) {
      const full = join(path, entry);
      if (statSync(full).isDirectory()) files(full, out);
      else if (/\.tsx?$/.test(entry)) out.push(full);
    }
    return out;
  }

  test("pt-BR and en have the same keys", () => {
    expect([...en].sort()).toEqual([...pt].sort());
  });

  test("every literal rentals.* key used by the feature exists", () => {
    const used = new Set<string>();
    for (const file of files(join(__dirname, "..", "..", "src", "features", "rentals"))) {
      for (const match of readFileSync(file, "utf8").matchAll(/["'`]rentals\.([A-Za-z0-9_.]+)["'`]/g)) used.add(match[1] ?? "");
    }
    expect(used.size).toBeGreaterThan(20);
    const missing = [...used].filter((key) => !pt.has(key));
    expect(missing).toEqual([]);
  });

  test("dynamic keys exist for every enum value", () => {
    const dynamic = [
      ...["DRAFT", "RESERVED", "ACTIVE", "RETURNED", "CLOSED", "CANCELLED", "OVERDUE"].map((s) => `status.${s}`),
      ...["SIGNED", "ABSENT", "REFUSED"].map((s) => `signature.${s}`),
      ...["MINOR", "MODERATE", "SEVERE"].map((s) => `severity.${s}`),
      ...["FRONT", "REAR", "LEFT", "RIGHT", "TOP", "CAB", "ENGINE", "UNDERCARRIAGE", "TIRES_TRACKS", "IMPLEMENT", "OTHER"].map((s) => `zone.${s}`),
      ...["locale", "identity", "walkaround", "readings", "checklist", "damages", "accessories", "briefing", "terms", "signatures", "review", "charges"].map((s) => `wizard.step.${s}`),
    ];
    expect(dynamic.filter((key) => !pt.has(key))).toEqual([]);
  });
});
