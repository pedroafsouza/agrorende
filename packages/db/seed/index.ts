import { createHash } from "node:crypto";

import type { Db } from "mongodb";

import { closeClient, getDb } from "../src/client.js";
import { COLLECTION_NAMES, collection } from "../src/collections.js";
import { ensureIndexes } from "../src/ensureIndexes.js";
import { documentSchemas } from "../src/schemas/index.js";
import type { CollectionName, Uuid } from "../src/types.js";

const DAY_MS = 86_400_000;
const BASE_TIME = Date.UTC(2026, 9, 8, 12, 0, 0, 0);
const ORG_A = uuid(1);
const ORG_B = uuid(2);
const SEQUENCE_KEYS = ["FR", "WO", "RN", "BD", "AGR"] as const;

interface SeedResult {
  readonly collections: number;
  readonly documents: number;
  readonly indexes: number;
}

type SeedDoc = Record<string, unknown>;
type SeedBag = { readonly [K in CollectionName]?: readonly SeedDoc[] };

function uuid(value: number): Uuid {
  const tail = value.toString(16).padStart(12, "0");
  return `018fd000-0000-7000-8000-${tail}`;
}

function now(offsetDays = 0): Date {
  return new Date(BASE_TIME + offsetDays * DAY_MS);
}

function isoDate(offsetDays: number): string {
  return now(offsetDays).toISOString().slice(0, 10);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function localized(pt: string, en: string): Record<"pt-BR" | "en", string> {
  return { "pt-BR": pt, en };
}

function settings(): SeedDoc {
  return {
    slaHours: { CRITICAL: 4, HIGH: 24, MEDIUM: 72, LOW: 168 },
    slaAtRiskRatio: 0.25,
    requireWoSignature: true,
    rentalGraceHours: 2,
    rentalDueSoonHours: 24,
    rentalTerms: { version: 1, text: localized("Termos de locação v1", "Rental terms v1") },
    officePhone: "+5516999990000",
    officeWhatsApp: "+5516999990000",
    defaultSiteRadiusM: 200,
    media: { videoMaxSeconds: 60, maxVideosPerReport: 5, audioMaxSeconds: 120, photoMaxPx: 2048, photoQuality: 0.8 },
    location: { intervalSec: 15, distanceM: 25 },
    staleSyncAlertHours: 24,
    showLaborCostToManager: true,
    onboarding: { steps: { assets: false, team: false, qr: false, app: false } },
  };
}

let version = 0;
function base(id: Uuid, organizationId = ORG_A, offsetDays = -30): SeedDoc {
  version += 1;
  return {
    _id: id,
    organizationId,
    syncVersion: version,
    createdAt: now(offsetDays),
    updatedAt: now(offsetDays),
    deletedAt: null,
  };
}

function assetCode(index: number): string {
  return `AGR-${String(index).padStart(6, "0")}`;
}

function pick<T>(items: readonly T[], index: number): T {
  const value = items[index % items.length];
  if (value === undefined) throw new Error("seed pick received an empty array");
  return value;
}

function checklistItem(key: string, pt: string, en: string, required = true): SeedDoc {
  return {
    key,
    label: localized(pt, en),
    type: "PASS_FAIL_NA",
    required,
    isSafetyCritical: key.includes("seguranca") || key.includes("safety"),
    photo: key.includes("foto") || key.includes("photo") ? "ALWAYS" : "NEVER",
  };
}

function buildSeed(): SeedBag {
  version = 0;
  const userIds = Array.from({ length: 10 }, (_, index) => uuid(100 + index));
  const siteIds = Array.from({ length: 9 }, (_, index) => uuid(200 + index));
  const customerIds = Array.from({ length: 10 }, (_, index) => uuid(300 + index));
  const assetIds = Array.from({ length: 40 }, (_, index) => uuid(400 + index));
  const templateIds = [uuid(600), uuid(601), uuid(602)];
  const seasonIds = [uuid(700), uuid(701)];

  const organizations: SeedDoc[] = [
    {
      _id: ORG_A,
      name: "AgroRende Demo Agro",
      legalName: "AgroRende Demo Agro Ltda.",
      taxId: "11222333000181",
      timezone: "America/Sao_Paulo",
      locale: "pt-BR",
      supportedLocales: ["pt-BR", "en"],
      currency: "BRL",
      status: "ACTIVE",
      plan: "trial",
      trialEndsAt: null,
      pastDueAt: null,
      suspendedAt: null,
      cancelledAt: null,
      purgeAfter: null,
      termsVersion: "1",
      termsAcceptedAt: now(-15),
      termsAcceptedById: userIds[0],
      signupSource: "seed",
      expectedFieldUsers: "6-20",
      createdById: userIds[0],
      settings: settings(),
      syncVersion: 0,
      createdAt: now(-40),
      updatedAt: now(-1),
    },
    {
      _id: ORG_B,
      name: "Fazenda Boa Vista",
      legalName: "Fazenda Boa Vista Ltda.",
      taxId: "55999888000110",
      timezone: "America/Sao_Paulo",
      locale: "pt-BR",
      supportedLocales: ["pt-BR", "en"],
      currency: "BRL",
      status: "TRIAL",
      plan: "trial",
      trialEndsAt: now(5),
      pastDueAt: null,
      suspendedAt: null,
      cancelledAt: null,
      purgeAfter: null,
      termsVersion: "1",
      termsAcceptedAt: now(-1),
      termsAcceptedById: userIds[9],
      signupSource: "seed",
      expectedFieldUsers: "1-5",
      createdById: userIds[9],
      settings: settings(),
      syncVersion: 0,
      createdAt: now(-2),
      updatedAt: now(-1),
    },
  ];

  const users: SeedDoc[] = [
    ["admin@agrorende.dev", "Ana Admin", "ADMIN", [], null, null],
    ["gerente@agrorende.dev", "Paulo Gerente", "MANAGER", [], null, null],
    ["despacho@agrorende.dev", "Marina Despacho", "MANAGER", [], null, null],
    ["inspetor@agrorende.dev", "Joana Inspetora", "FIELD", [], null, null],
    ["tecnico1@agrorende.dev", "Carlos Técnico", "FIELD", ["ENGINE", "HYDRAULIC"], 8_500, siteIds[0]],
    ["tecnico2@agrorende.dev", "Pedro Técnico", "FIELD", ["ELECTRICAL", "TRANSMISSION"], 8_000, siteIds[1]],
    ["tecnico3@agrorende.dev", "Lucas Técnico", "FIELD", ["TIRES_TRACKS", "BRAKES"], 7_500, siteIds[2]],
    ["locacao@agrorende.dev", "Rafael Locação", "FIELD", [], null, null],
    ["convite@agrorende.dev", "Bruno Convidado", "FIELD", [], null, null],
  ].map(([email, name, role, skills, hourlyCostCents, homeSiteId], index) => ({
    ...base(userIds[index] ?? uuid(190 + index)),
    email,
    name,
    phone: `+55169999${String(index).padStart(4, "0")}`,
    passwordHash: `sha256:${sha256("agrorende123")}`,
    role,
    skills,
    locale: "pt-BR",
    hourlyCostCents,
    avatarMediaId: null,
    isActive: true,
    joinedAt: index === 8 ? null : now(-20 + index),
    disabledAt: null,
    archivedAt: null,
    invitedById: index === 8 ? userIds[0] : null,
    mustChangePassword: false,
    dutyStatus: index === 4 ? "ON_DUTY" : "OFF_DUTY",
    dutyChangedAt: index === 4 ? now(0) : null,
    locationConsentAt: role === "FIELD" ? now(-10) : null,
    scopeEpoch: 0,
    homeSiteId,
    vanStockLocationId: null,
    lastSeenAt: now(-index),
    notificationPrefs: { pushMuted: false, mutedTypes: [] },
  }));
  users.push({
    ...base(userIds[9] ?? uuid(109), ORG_B),
    email: "admin@boavista.dev",
    name: "Beatriz Boa Vista",
    phone: "+551699990999",
    passwordHash: `sha256:${sha256("agrorende123")}`,
    role: "ADMIN",
    skills: [],
    locale: "pt-BR",
    hourlyCostCents: null,
    avatarMediaId: null,
    isActive: true,
    joinedAt: now(-1),
    disabledAt: null,
    archivedAt: null,
    invitedById: null,
    mustChangePassword: false,
    dutyStatus: "OFF_DUTY",
    dutyChangedAt: null,
    locationConsentAt: null,
    scopeEpoch: 0,
    homeSiteId: null,
    vanStockLocationId: null,
    lastSeenAt: now(-1),
    notificationPrefs: { pushMuted: false, mutedTypes: [] },
  });

  const siteRows = [
    ["Oficina Central Ribeirão Preto", "WORKSHOP", -21.17, -47.81],
    ["Pátio Sertãozinho", "YARD", -21.137, -47.99],
    ["Fazenda Boa Vista (Jardinópolis)", "FARM", -21.017, -47.764],
    ["Fazenda Santa Clara (Cravinhos)", "FARM", -21.34, -47.729],
    ["Fazenda São José (Serrana)", "FARM", -21.211, -47.595],
    ["Fazenda Recanto (Brodowski)", "FARM", -20.991, -47.659],
    ["Fazenda Esperança (Dumont)", "FARM", -21.236, -47.973],
    ["Usina Pradópolis", "FARM", -21.359, -48.065],
    ["Fazenda Guatapará", "FARM", -21.496, -48.038],
  ] as const;
  const sites = siteRows.map(([name, type, lat, lng], index) => ({
    ...base(siteIds[index] ?? uuid(220 + index)),
    name,
    type,
    customerId: index >= 2 ? pick(customerIds, index - 2) : null,
    address: `${index + 1} Rodovia AgroRende`,
    city: "Ribeirão Preto",
    state: "SP",
    lat,
    lng,
    radiusM: 200,
    notes: index >= 2 ? "after the 2nd silo, left at the eucalyptus" : null,
    isActive: true,
    archivedAt: null,
  }));

  const plotCounts = [0, 0, 4, 3, 3, 2, 3, 2, 3];
  const crops = ["soja", "milho", "cana", "café", "arroz"];
  const plots = plotCounts.flatMap((count, siteIndex) => Array.from({ length: count }, (_, plotIndex) => ({
    ...base(uuid(800 + siteIndex * 10 + plotIndex)),
    siteId: siteIds[siteIndex] ?? uuid(299),
    name: `Talhão ${plotIndex + 1}`,
    code: `T${siteIndex}-${plotIndex + 1}`,
    areaHa: 20 + siteIndex * 11 + plotIndex * 7,
    crop: pick(crops, siteIndex + plotIndex),
    boundary: null,
    centroidLat: (siteRows[siteIndex]?.[2] ?? -21) + 0.003 * (plotIndex + 1),
    centroidLng: (siteRows[siteIndex]?.[3] ?? -47) - 0.003 * (plotIndex + 1),
    archivedAt: null,
  })));

  const seasons = [
    {
      ...base(seasonIds[0] ?? uuid(700)),
      name: "Safra 2026/27",
      crop: "soja",
      startsOn: "2026-09-15",
      endsOn: "2027-03-31",
      isCurrent: true,
      criticalWindows: [{ name: "Plantio", startsOn: "2026-10-01", endsOn: "2026-11-30", assetCategories: ["PLANTER", "TRACTOR", "SPRAYER"] }],
    },
    {
      ...base(seasonIds[1] ?? uuid(701)),
      name: "Safrinha 2027",
      crop: "milho",
      startsOn: "2027-02-01",
      endsOn: "2027-07-31",
      isCurrent: false,
      criticalWindows: [],
    },
  ];

  const customers = ["Fazenda Boa Vista", "Fazenda Santa Clara", "Fazenda São José", "Fazenda Recanto", "Fazenda Esperança", "Usina Pradópolis", "Construtora Ribeirão", "Obras Dumont", "Cliente Sem Telefone A", "Cliente Sem Telefone B"].map((name, index) => ({
    ...base(customerIds[index] ?? uuid(300 + index)),
    name,
    tradeName: name,
    taxIdType: index % 2 === 0 ? "CNPJ" : "CPF",
    taxId: index % 2 === 0 ? "11222333000181" : "52998224725",
    phone: index >= 8 ? null : `+55169998${String(index).padStart(4, "0")}`,
    whatsapp: index >= 8 ? null : `+55169998${String(index).padStart(4, "0")}`,
    email: `cliente${index + 1}@example.com`,
    address: `${index + 10} Estrada Rural`,
    city: "Ribeirão Preto",
    state: "SP",
    isSupplier: index === 6,
    notes: null,
    archivedAt: null,
  }));

  const categories = ["TRACTOR", "HARVESTER", "SPRAYER", "PLANTER", "TRUCK", "PICKUP", "LOADER", "EXCAVATOR", "GENERATOR", "IRRIGATION"];
  const assets: SeedDoc[] = Array.from({ length: 39 }, (_, index) => {
    const num = index + 1;
    const condition = index < 31 ? "OPERATIONAL" : index < 35 ? "NEEDS_REPAIR" : index < 38 ? "IN_REPAIR" : index === 38 ? "OUT_OF_SERVICE" : "RETIRED";
    return {
      ...base(assetIds[index] ?? uuid(400 + index)),
      code: assetCode(num),
      name: num === 12 ? "Trator JD 6110J #12" : `${pick(categories, index)} AgroRende #${num}`,
      category: num <= 12 ? "TRACTOR" : pick(categories, index),
      make: pick(["John Deere", "Case IH", "New Holland", "Massey Ferguson", "Valtra", "Volvo", "Scania", "Mercedes-Benz"], index),
      model: num === 12 ? "6110J" : `M${100 + num}`,
      year: 2015 + (index % 10),
      serialNumber: `SN${assetCode(num)}`,
      plate: num > 24 && num <= 33 ? `ABC${1000 + num}` : null,
      ownerType: "ORGANIZATION",
      ownerCustomerId: null,
      condition,
      conditionChangedAt: now(-7),
      homeSiteId: num === 12 ? siteIds[3] : pick(siteIds, index),
      currentSiteId: num === 12 ? siteIds[3] : pick(siteIds, index + 1),
      currentPlotId: num === 12 ? uuid(832) : null,
      lastLat: -21.1 - index / 1000,
      lastLng: -47.7 - index / 1000,
      lastLocatedAt: now(-1),
      hourMeter: num === 12 ? 4298 : 120 + index * 240,
      odometerKm: num > 24 ? 10_000 + index * 500 : null,
      tankCapacityL: num === 12 ? 300 : 180,
      isRentable: num <= 10 || num === 12,
      defaultRateCents: num === 12 ? 85_000 : num <= 10 ? 70_000 + index * 1_000 : null,
      defaultRateUnit: num <= 10 || num === 12 ? "DAY" : null,
      currentRentalId: null,
      coverMediaId: null,
      specs: {},
      notes: null,
    };
  });
  assets.push({
    ...base(assetIds[39] ?? uuid(439), ORG_B),
    code: "AGR-BV-000001",
    name: "Trator Boa Vista #1",
    category: "TRACTOR",
    make: "Valtra",
    model: "A950",
    year: 2020,
    serialNumber: "BV001",
    plate: null,
    ownerType: "ORGANIZATION",
    ownerCustomerId: null,
    condition: "OPERATIONAL",
    conditionChangedAt: now(-1),
    homeSiteId: null,
    currentSiteId: null,
    currentPlotId: null,
    lastLat: null,
    lastLng: null,
    lastLocatedAt: null,
    hourMeter: 900,
    odometerKm: null,
    tankCapacityL: 200,
    isRentable: false,
    defaultRateCents: null,
    defaultRateUnit: null,
    currentRentalId: null,
    coverMediaId: null,
    specs: {},
    notes: "Cross-tenant fixture",
  });

  const templates = [
    ["Locação — Trator e máquinas agrícolas", "RENTAL", 18],
    ["Locação — Caminhão", "RENTAL", 16],
    ["Serviço corretivo padrão", "WORK_ORDER", 10],
  ].map(([name, appliesTo, count], index) => ({
    ...base(templateIds[index] ?? uuid(600 + index)),
    name,
    appliesTo: [appliesTo],
    assetCategories: [],
    templateVersion: 1,
    items: Array.from({ length: Number(count) }, (_, itemIndex) => checklistItem(`item_${itemIndex + 1}`, `Item ${itemIndex + 1}`, `Item ${itemIndex + 1}`)),
    accessories: index === 0 ? [
      { accessoryKey: "manual", label: localized("Manual", "Manual"), defaultQty: 1, replacementCostCents: 5_000 },
      { accessoryKey: "spare_key", label: localized("Chave reserva", "Spare key"), defaultQty: 1, replacementCostCents: 15_000 },
      { accessoryKey: "toolbox", label: localized("Caixa de ferramentas", "Toolbox"), defaultQty: 1, replacementCostCents: 25_000 },
    ] : [],
    isActive: true,
    archivedAt: null,
  }));

  const damages = [0, 1].map((item) => ({
    ...base(uuid(900 + item)),
    assetId: assetIds[11],
    zone: item === 0 ? "LEFT" : "RIGHT",
    severity: "MINOR",
    description: `Pre-existing scratch ${item + 1}`,
    isPreExisting: true,
    detectedInspectionId: null,
    detectedRentalId: null,
    matchedDamageId: null,
    matchStatus: "MATCHED",
    disputeStatus: "NONE",
    customerStatement: null,
    fieldReportId: null,
    estimatedCostCents: 10_000,
    reportedById: userIds[4],
    repairedAt: null,
    repairedWorkOrderId: null,
  }));

  const fieldReports = Array.from({ length: 20 }, (_, index) => ({
    ...base(uuid(1000 + index), ORG_A, -10 + index),
    number: `FR-${String(index + 1).padStart(6, "0")}`,
    reporterId: pick(userIds, 3 + index),
    assetId: index === 2 || index === 13 ? null : pick(assetIds, index),
    unregisteredAssetDesc: index === 2 || index === 13 ? `Unregistered implement ${index}` : null,
    siteId: pick(siteIds, index),
    plotId: null,
    seasonId: seasonIds[0],
    rentalId: index === 5 ? uuid(1204) : null,
    damageId: null,
    category: pick(["ENGINE", "HYDRAULIC", "ELECTRICAL", "BRAKES", "SAFETY"], index),
    priority: index < 3 ? "CRITICAL" : pick(["HIGH", "MEDIUM", "LOW"], index),
    machineOperable: index % 4 !== 0,
    suggestedAction: index < 3 ? "REPAIR_NOW" : "MONITOR",
    title: `Relato de campo ${index + 1}`,
    description: `Seeded field report ${index + 1}`,
    status: pick(["SUBMITTED", "IN_REVIEW", "MARKED_FOR_REPAIR", "MONITORING", "DISMISSED"], index),
    statusReason: null,
    lat: -21.1,
    lng: -47.8,
    accuracyM: 12,
    occurredAt: now(-3),
    receivedAt: now(-3),
    reviewedById: index % 5 === 0 ? userIds[1] : null,
    reviewedAt: index % 5 === 0 ? now(-2) : null,
    workOrderId: null,
    flags: index === 0 ? { critical: true } : {},
  }));

  const woStatuses = ["OPEN", "OPEN", "ASSIGNED", "ASSIGNED", "ACCEPTED", "EN_ROUTE", "EN_ROUTE", "ON_SITE", "IN_PROGRESS", "IN_PROGRESS", "ON_HOLD", "COMPLETED", "COMPLETED", "VERIFIED", "CANCELLED"];
  const workOrders = woStatuses.map((status, index) => ({
    ...base(uuid(1100 + index), ORG_A, -6 + index),
    number: `WO-${String(index + 1).padStart(6, "0")}`,
    type: index % 5 === 0 ? "PREVENTIVE" : "CORRECTIVE",
    status,
    priority: index === 0 ? "CRITICAL" : pick(["HIGH", "MEDIUM", "LOW"], index),
    title: `Ordem de serviço ${index + 1}`,
    description: `Seeded work order ${index + 1}`,
    scheduledFor: isoDate(index),
    assetId: pick(assetIds, index),
    siteId: pick(siteIds, index),
    plotId: null,
    customerId: pick(customerIds, index),
    seasonId: seasonIds[0],
    fieldReportId: index < fieldReports.length ? uuid(1000 + index) : null,
    rentalId: null,
    maintenancePlanId: null,
    damageIds: [],
    assigneeId: index === 0 ? null : pick(userIds, 4 + index),
    previousAssigneeIds: index % 4 === 0 ? [userIds[4] ?? uuid(104)] : [],
    createdById: userIds[1],
    dueAt: now(index === 0 ? -1 : 1),
    slaAtRiskNotifiedAt: index === 1 ? now(0) : null,
    slaBreachedAt: index === 0 ? now(0) : null,
    destLat: -21.2,
    destLng: -47.7,
    locationNote: null,
    holdReason: status === "ON_HOLD" ? "WAITING_PARTS" : null,
    holdNote: status === "ON_HOLD" ? "Awaiting hydraulic hose" : null,
    checklistTemplateId: templateIds[2],
    checklistTemplateVersion: 1,
    checklistSnapshot: templates[2]?.items ?? [],
    checklistResponses: status === "COMPLETED" || status === "VERIFIED" ? [{ key: "item_1", value: "PASS", mediaIds: [], answeredAt: now(-1).toISOString() }] : [],
    resolution: status === "COMPLETED" || status === "VERIFIED" ? "Serviço concluído" : null,
    documentLocale: "pt-BR",
    rootCause: null,
    hourMeterReading: 4300 + index,
    customerSignerName: null,
    signatureStatus: status === "COMPLETED" || status === "VERIFIED" ? "SIGNED" : null,
    signatureReason: null,
    signatureWitnessName: null,
    signatureMediaId: null,
    clockOffsetMs: 0,
    assignedAt: index > 1 ? now(-5) : null,
    acceptedAt: index > 3 ? now(-4) : null,
    enRouteAt: index > 5 ? now(-3) : null,
    arrivedAt: index > 7 ? now(-2) : null,
    startedAt: index > 8 ? now(-2) : null,
    completedAt: status === "COMPLETED" || status === "VERIFIED" ? now(-1) : null,
    verifiedAt: status === "VERIFIED" ? now(0) : null,
    verifiedById: status === "VERIFIED" ? userIds[1] : null,
    cancelledAt: status === "CANCELLED" ? now(-1) : null,
    cancelReason: status === "CANCELLED" ? "Duplicated" : null,
    travelMinutes: null,
    workMinutes: null,
    laborCostCents: null,
    partsCostCents: null,
    externalCostCents: null,
    externalCostNote: null,
    hasLateEvidence: false,
  }));

  const rentalStatuses = ["DRAFT", "RESERVED", "RESERVED", "ACTIVE", "ACTIVE", "RETURNED", "CLOSED", "CANCELLED"];
  const rentals: SeedDoc[] = rentalStatuses.map((status, index) => ({
    ...base(uuid(1200 + index), ORG_A, -8 + index),
    number: `RN-${String(index + 1).padStart(6, "0")}`,
    direction: "OUTBOUND",
    status,
    assetId: pick(assetIds, index),
    customerId: pick(customerIds, index),
    siteId: pick(siteIds, index),
    seasonId: seasonIds[0],
    agentId: userIds[7],
    createdById: userIds[7],
    plannedStart: now(index === 1 ? 0 : -index),
    plannedEnd: now(index === 4 ? -1 : index + 1),
    actualStart: status === "ACTIVE" || status === "RETURNED" || status === "CLOSED" ? now(-2) : null,
    actualEnd: status === "RETURNED" || status === "CLOSED" ? now(0) : null,
    rateCents: 85_000,
    rateUnit: "DAY",
    depositCents: 0,
    includedHoursPerDay: 8,
    extraHourRateCents: 15_000,
    lateFeePerDayCents: 20_000,
    fuelPolicy: "CHARGE_DIFFERENCE",
    fuelPriceCents: 650,
    deliveryMode: "PICKUP",
    deliveryAddress: null,
    deliverySiteId: null,
    deliveryLat: null,
    deliveryLng: null,
    documentLocale: "pt-BR",
    termsVersion: 1,
    notes: null,
    checkOutInspectionId: index >= 3 && index <= 6 ? uuid(1300 + index) : null,
    checkInInspectionId: index >= 5 && index <= 6 ? uuid(1310 + index) : null,
    chargesTotalCents: index >= 5 ? 170_000 : null,
    chargesVersion: 1,
    balanceDueCents: index === 5 ? 170_000 : null,
    dueSoonNotifiedAt: index === 3 ? now(0) : null,
    overdueNotifiedAt: index === 4 ? now(0) : null,
    settlementRef: null,
    closedAt: status === "CLOSED" ? now(0) : null,
    closedById: status === "CLOSED" ? userIds[7] : null,
    cancelledAt: status === "CANCELLED" ? now(-1) : null,
    cancelReason: status === "CANCELLED" ? "Customer cancelled" : null,
  }));

  const inspections = rentals.flatMap((rental, index) => {
    const docs: SeedDoc[] = [];
    if (rental.checkOutInspectionId !== null) {
      docs.push({
        ...base(rental.checkOutInspectionId as Uuid),
        type: "CHECK_OUT",
        rentalId: rental._id,
        assetId: rental.assetId,
        performedById: userIds[7],
        performedAt: now(-2),
        templateId: templateIds[0],
        templateVersion: 1,
        templateSnapshot: templates[0]?.items ?? [],
        responses: [],
        hourMeter: 4300 + index,
        odometerKm: null,
        fuelPercent: 100,
        accessories: [],
        safetyBriefingGiven: true,
        operatorName: "Operador Cliente",
        operatorDocument: "52998224725",
        termsAccepted: true,
        termsVersion: 1,
        documentLocale: "pt-BR",
        signerName: "Cliente",
        signerDocument: "52998224725",
        signerRole: "CUSTOMER",
        signatureStatus: "SIGNED",
        signatureReason: null,
        customerSignatureMediaId: null,
        agentSignatureMediaId: null,
        lat: -21.2,
        lng: -47.8,
        notes: null,
      });
    }
    if (rental.checkInInspectionId !== null) {
      docs.push({
        ...base(rental.checkInInspectionId as Uuid),
        type: "CHECK_IN",
        rentalId: rental._id,
        assetId: rental.assetId,
        performedById: userIds[7],
        performedAt: now(0),
        templateId: templateIds[0],
        templateVersion: 1,
        templateSnapshot: templates[0]?.items ?? [],
        responses: [],
        hourMeter: 4310 + index,
        odometerKm: null,
        fuelPercent: 75,
        accessories: [],
        safetyBriefingGiven: false,
        operatorName: null,
        operatorDocument: null,
        termsAccepted: true,
        termsVersion: 1,
        documentLocale: "pt-BR",
        signerName: "Cliente",
        signerDocument: "52998224725",
        signerRole: "CUSTOMER",
        signatureStatus: "SIGNED",
        signatureReason: null,
        customerSignatureMediaId: null,
        agentSignatureMediaId: null,
        lat: -21.2,
        lng: -47.8,
        notes: null,
      });
    }
    return docs;
  });

  const media = Array.from({ length: 12 }, (_, index) => ({
    ...base(uuid(1400 + index)),
    kind: "PHOTO",
    status: "UPLOADED",
    tag: pick(["GENERAL", "BEFORE", "AFTER", "DAMAGE"], index),
    mimeType: "image/jpeg",
    sizeBytes: 100_000 + index,
    durationMs: null,
    width: 1024,
    height: 768,
    storageKey: `org/${ORG_A}/media/2026/10/${uuid(1400 + index)}.jpg`,
    thumbnailKey: `org/${ORG_A}/media/2026/10/${uuid(1400 + index)}_thumb.jpg`,
    variants: { original: { status: "UPLOADED", key: `org/${ORG_A}/media/2026/10/${uuid(1400 + index)}.jpg`, sizeBytes: 100_000 + index, uploadedAt: now(-1).toISOString() } },
    caption: null,
    capturedAt: now(-1),
    capturedById: pick(userIds, 4 + index),
    lat: -21.2,
    lng: -47.8,
    uploadedAt: now(-1),
    parent: { type: "FIELD_REPORT", id: uuid(1000 + (index % 20)) },
    damageId: null,
    checklistItemKey: null,
    isLateEvidence: false,
  }));

  const devices = userIds.slice(3, 9).map((userId, index) => ({
    _id: uuid(1500 + index),
    organizationId: ORG_A,
    userId,
    installationId: `seed-device-${index + 1}`,
    platform: index % 2 === 0 ? "IOS" : "ANDROID",
    model: "Seed Phone",
    osVersion: "18",
    appVersion: "0.1.0",
    runtimeVersion: "0.1.0",
    pushToken: null,
    pushStatus: "OK",
    scopeEpoch: 0,
    lastSeenAt: now(index === 5 ? -2 : 0),
    lastSyncAt: now(index === 5 ? -1.25 : 0),
    lastPullVersion: version,
    pendingMutations: index === 5 ? 12 : 0,
    pendingUploads: index === 5 ? 4 : 0,
    pendingBytes: index === 5 ? 500_000 : 0,
    oldestPendingAt: index === 5 ? now(-1.25) : null,
    batteryLevel: 0.85,
    freeStorageBytes: 1_000_000_000,
    clockOffsetMs: 0,
    createdAt: now(-10),
    updatedAt: now(0),
  }));

  const locationPings = userIds.slice(4, 8).map((userId, index) => ({
    _id: uuid(1600 + index),
    organizationId: ORG_A,
    userId,
    deviceId: uuid(1501 + index),
    recordedAt: now(0),
    receivedAt: now(0),
    lat: -21.17 + index / 100,
    lng: -47.81 - index / 100,
    accuracyM: 8,
    speedMps: 0,
    heading: null,
    batteryLevel: 0.8,
    workOrderId: index === 0 ? uuid(1102) : null,
  }));

  const workOrderParts = [
    { ...base(uuid(1700)), workOrderId: uuid(1111), name: "Filtro hidráulico", partNumber: "FH-100", quantity: 1, unit: "un", unitCostCents: 12_000, partId: null, stockLocationId: null, addedById: userIds[4] },
  ];
  const rentalCharges = [{ ...base(uuid(1800)), rentalId: uuid(1205), type: "BASE", description: "Diária", quantity: 2, unitAmountCents: 85_000, amountCents: 170_000, isAuto: true, damageId: null, accessoryKey: null }];
  const activityEvents = [{ ...base(uuid(1900)), actorId: userIds[4], deviceId: null, entityType: "WORK_ORDER", entityId: uuid(1111), action: "workOrder.complete", fromStatus: "IN_PROGRESS", toStatus: "COMPLETED", meta: {}, lat: null, lng: null, occurredAt: now(-1), receivedAt: now(-1), clockOffsetMs: 0, mutationId: null }];
  const notifications = [{ ...base(uuid(2000)), userId: userIds[4], type: "WO_ASSIGNED", title: "Nova OS", body: "Você recebeu uma ordem de serviço.", entityType: "WORK_ORDER", entityId: uuid(1102), readAt: null, pushedAt: null }];

  return {
    organizations,
    sync_counters: [
      { _id: ORG_A, value: version, horizonVersion: 0 },
      { _id: ORG_B, value: version, horizonVersion: 0 },
    ],
    number_sequences: SEQUENCE_KEYS.flatMap((key) => [
      { _id: `${ORG_A}:${key}`, organizationId: ORG_A, key, value: key === "FR" ? 20 : key === "WO" ? 15 : key === "RN" ? 8 : key === "AGR" ? 39 : 0 },
      { _id: `${ORG_B}:${key}`, organizationId: ORG_B, key, value: key === "AGR" ? 1 : 0 },
    ]),
    users,
    user_identities: [{ _id: uuid(2100), organizationId: ORG_A, userId: userIds[4], provider: "GOOGLE", subject: "mock-google-tecnico1", email: "tecnico1@agrorende.dev", emailVerified: true, isPrivateRelay: false, providerRefreshTokenEnc: null, lastUsedAt: now(-1), createdAt: now(-20) }],
    auth_links: [{ _id: uuid(2200), organizationId: ORG_A, userId: userIds[8], kind: "INVITE", codeHash: sha256("K7QM2XPA9F"), role: "FIELD", email: "convite@agrorende.dev", createdById: userIds[0], expiresAt: now(7), redeemedAt: null, redeemedVia: null, revokedAt: null, createdAt: now(0) }],
    sites,
    plots,
    seasons,
    customers,
    assets,
    checklist_templates: templates,
    damages,
    field_reports: fieldReports,
    work_orders: workOrders,
    work_order_parts: workOrderParts,
    rentals,
    rental_charges: rentalCharges,
    inspections,
    media,
    devices,
    location_pings: locationPings,
    activity_events: activityEvents,
    notifications,
  };
}

async function assertEmpty(db: Db): Promise<void> {
  for (const collectionName of COLLECTION_NAMES) {
    const count = await db.collection(collectionName).estimatedDocumentCount();
    if (count > 0) {
      throw new Error("pnpm db:seed refuses to run on a non-empty database unless --force is passed.");
    }
  }
}

async function clear(db: Db): Promise<void> {
  for (const collectionName of COLLECTION_NAMES) {
    await db.collection(collectionName).deleteMany({});
  }
}

async function insertDocs(db: Db, bag: SeedBag): Promise<number> {
  let documents = 0;
  for (const collectionName of COLLECTION_NAMES) {
    const docs = bag[collectionName] ?? [];
    if (docs.length === 0) continue;
    const schema = documentSchemas[collectionName];
    const parsed = docs.map((doc) => schema.parse(doc));
    await collection(db, collectionName).insertMany(parsed);
    documents += parsed.length;
  }
  return documents;
}

export async function seedDatabase(db: Db, options: { readonly force?: boolean } = {}): Promise<SeedResult> {
  if (process.env.APP_ENV === "production") {
    throw new Error("pnpm db:seed refuses to run when APP_ENV=production.");
  }

  const indexes = await ensureIndexes(db);
  if (options.force === true) {
    await clear(db);
  } else {
    await assertEmpty(db);
  }

  const documents = await insertDocs(db, buildSeed());
  return { collections: COLLECTION_NAMES.length, documents, indexes };
}

async function main(): Promise<void> {
  const db = await getDb();
  const force = process.argv.includes("--force");
  const result = await seedDatabase(db, { force });
  process.stdout.write(`seeded ${result.documents} documents across ${result.collections} collections; ensured ${result.indexes} indexes\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .finally(closeClient)
    .catch((error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}
