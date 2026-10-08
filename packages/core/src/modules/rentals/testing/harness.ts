import { closeClient, withSyncTx, type SyncTx } from "@agrorende/db";
import { setupTestDb, type TestDbHandle } from "@agrorende/db/testing";
import type { CheckOutInspection, CheckInInspection } from "@agrorende/contracts/mutations";
import type { MediaMeta } from "@agrorende/contracts/sync";

import type { MutationMeta } from "../../../sync/types.js";
import { makeTestCtx, type TestCtx } from "../../../testing/ctx.js";
import { newId } from "../../assets/kit.js";

export type Row = { _id: string } & Record<string, unknown>;

export const ORG_ID = "00000000-0000-7000-8000-000000000001";
export const OTHER_ORG_ID = "00000000-0000-7000-8000-0000000000ff";
export const ADMIN_ID = "00000000-0000-7000-8000-000000000002";
export const AGENT_ID = "00000000-0000-7000-8000-0000000000a1";
export const OTHER_AGENT_ID = "00000000-0000-7000-8000-0000000000a2";
export const TEMPLATE_ID = "00000000-0000-7000-8000-0000000000c1";

const rawCollection = (db: TestDbHandle["db"], name: string) => db.collection<Row>(name);

export interface Harness {
  readonly handle: TestDbHandle;
  readonly ctx: TestCtx;
  raw(name: string): ReturnType<typeof rawCollection>;
  run<T>(fn: (tx: SyncTx) => Promise<T>, ctx?: TestCtx): Promise<T>;
  close(): Promise<void>;
}

/** Isolated database per test file: `agrorende_t08_<suffix>` (R6). */
export async function createHarness(suffix: string): Promise<Harness> {
  const name = `agrorende_t08_${suffix}`;
  process.env.MONGODB_URI ??= "mongodb://localhost:27017/?directConnection=true";
  process.env.MONGODB_DB = name;
  const handle = await setupTestDb(name);
  const ctx = makeTestCtx();
  const counters = handle.db.collection<{ _id: string; value: number; horizonVersion: number }>("sync_counters");
  await counters.insertOne({ _id: ctx.orgId, value: 0, horizonVersion: 0 });
  await counters.insertOne({ _id: OTHER_ORG_ID, value: 0, horizonVersion: 0 });
  return {
    handle,
    ctx,
    raw: (collection) => rawCollection(handle.db, collection),
    run: (fn, runCtx = ctx) => withSyncTx({ orgId: runCtx.orgId }, fn, handle.db),
    close: async () => {
      await handle.drop();
      await closeClient();
    },
  };
}

function stamps(orgId: string): Row {
  const now = new Date();
  return { _id: newId(), organizationId: orgId, syncVersion: 1, createdAt: now, updatedAt: now, deletedAt: null };
}

export function userRow(id: string, role: string, name: string, orgId = ORG_ID): Row {
  return { ...stamps(orgId), _id: id, name, role, isActive: true, phone: null, email: null, locale: "pt-BR" };
}

export function customerRow(orgId = ORG_ID, extra: Record<string, unknown> = {}): Row {
  return { ...stamps(orgId), name: "Fazenda Boa Vista", taxId: "12345678909", taxIdType: "CPF", phone: "+5565999990000", whatsapp: null, ...extra };
}

let sequence = 0;

export function rentalRow(assetId: string, customerId: string, extra: Record<string, unknown> = {}, orgId = ORG_ID): Row {
  sequence += 1;
  return {
    ...stamps(orgId),
    number: `RN-${String(900_000 + sequence)}`,
    direction: "OUTBOUND",
    status: "RESERVED",
    assetId,
    customerId,
    siteId: null,
    seasonId: null,
    agentId: null,
    createdById: ADMIN_ID,
    plannedStart: new Date("2026-11-01T08:00:00.000Z"),
    plannedEnd: new Date("2026-11-11T08:00:00.000Z"),
    actualStart: null,
    actualEnd: null,
    rateCents: 85_000,
    rateUnit: "DAY",
    depositCents: 200_000,
    includedHoursPerDay: 8,
    extraHourRateCents: 12_000,
    lateFeePerDayCents: null,
    fuelPolicy: "CHARGE_DIFFERENCE",
    fuelPriceCents: 620,
    deliveryMode: "PICKUP",
    documentLocale: "pt-BR",
    termsVersion: null,
    checkOutInspectionId: null,
    checkInInspectionId: null,
    chargesTotalCents: null,
    chargesVersion: 1,
    balanceDueCents: null,
    ...extra,
  };
}

export function meta(occurredAt: Date): MutationMeta {
  return { mutationId: newId(), deviceId: newId(), occurredAt, receivedAt: occurredAt, clockSkewed: false };
}

const WALKAROUND = ["WALKAROUND_FRONT", "WALKAROUND_REAR", "WALKAROUND_LEFT", "WALKAROUND_RIGHT", "WALKAROUND_CAB", "HOUR_METER", "FUEL_GAUGE"] as const;

export function mediaMeta(inspectionId: string, kind: string, tag: string, extra: Partial<MediaMeta> = {}): MediaMeta {
  return {
    id: newId(),
    kind,
    tag,
    mimeType: kind === "SIGNATURE" ? "image/png" : "image/jpeg",
    sizeBytes: 1000,
    capturedAt: new Date().toISOString(),
    parent: { type: "INSPECTION", id: inspectionId },
    ...extra,
  };
}

/** A complete check-in inspection payload (every guard satisfied). */
export function checkInInspection(assetId: string, extra: Partial<CheckInInspection> = {}): CheckInInspection {
  const id = extra.id ?? newId();
  const photos = WALKAROUND.map((tag) => mediaMeta(id, "PHOTO", tag));
  const customer = mediaMeta(id, "SIGNATURE", "SIGNATURE_CUSTOMER");
  const agent = mediaMeta(id, "SIGNATURE", "SIGNATURE_AGENT");
  return {
    id,
    assetId,
    templateId: TEMPLATE_ID,
    templateVersion: 1,
    templateSnapshot: [{ key: "oil", label: { "pt-BR": "Nível de óleo", en: "Oil level" }, type: "PASS_FAIL_NA", required: true, isSafetyCritical: false, photo: "NEVER" }],
    responses: [{ key: "oil", value: "PASS", mediaIds: [], answeredAt: new Date().toISOString() }],
    hourMeter: 4_398,
    fuelPercent: 85,
    accessories: [{ accessoryKey: "toolbox", expected: 1, present: 1 }],
    documentLocale: "pt-BR",
    signerName: "João Cliente",
    signatureStatus: "SIGNED",
    customerSignatureMediaId: customer.id,
    agentSignatureMediaId: agent.id,
    damages: [],
    media: [...photos, customer, agent],
    ...extra,
  };
}

/** A complete check-out inspection payload (every guard satisfied). */
export function checkOutInspection(assetId: string, extra: Partial<CheckOutInspection> = {}): CheckOutInspection {
  const base = checkInInspection(assetId, { ...(extra.id === undefined ? {} : { id: extra.id }), hourMeter: 4_312, fuelPercent: 100 });
  return { ...base, safetyBriefingGiven: true, operatorName: "Pedro Operador", termsAccepted: true, ...extra };
}
