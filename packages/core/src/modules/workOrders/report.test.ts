import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildReportModel, renderReportPdf as renderWorkOrderReport, type WorkOrderReportLabels } from "./report.js";
import { createSeededDb, ctxOf, ORG_A, PEOPLE, seedUuid, type SeededDb } from "./testing/seeded.js";

let db: SeededDb;
const WO = seedUuid(1111);

const labels: WorkOrderReportLabels = new Proxy({} as WorkOrderReportLabels, {
  get: (_target, key) => (key === "enumLabel" ? (group: string, value: string) => `${group}.${value}` : key === "morePhotos" ? "+{count}" : String(key)),
});

async function insertMedia(id: string, kind: "PHOTO" | "SIGNATURE", mimeType: string): Promise<void> {
  const now = new Date();
  await db.raw("media").insertOne({
    _id: id,
    organizationId: ORG_A,
    syncVersion: 1,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    kind,
    status: "UPLOADED",
    tag: kind === "PHOTO" ? "AFTER" : "GENERAL",
    mimeType,
    storageKey: `org/${ORG_A}/media/2025/01/${id}.${mimeType === "image/png" ? "png" : "jpg"}`,
    variants: {},
    capturedAt: now,
    capturedById: PEOPLE.carlos,
    parent: { type: "WORK_ORDER", id: WO },
    isLateEvidence: false,
  });
}

beforeAll(async () => {
  db = await createSeededDb("report");
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("work order report (WO-24)", () => {
  it("builds a permission-filtered model and renders a PDF with photos and the signature", async () => {
    const photoId = crypto.randomUUID();
    const signatureId = crypto.randomUUID();
    await insertMedia(photoId, "PHOTO", "image/jpeg");
    await insertMedia(signatureId, "SIGNATURE", "image/png");
    await db.raw("work_orders").updateOne({ _id: WO }, { $set: { signatureStatus: "SIGNED", signatureMediaId: signatureId, customerSignerName: "João", resolution: "Filter replaced", laborCostCents: 17_000 } });
    const jpeg = await sharp({ create: { width: 8, height: 6, channels: 3, background: "#2F6B3A" } }).jpeg().toBuffer();
    const png = await sharp({ create: { width: 8, height: 4, channels: 4, background: "#000000" } }).png().toBuffer();
    const reads: string[] = [];
    const readBlob = async (key: string): Promise<Uint8Array> => {
      reads.push(key);
      if (key.endsWith("_thumb.jpg")) return new Uint8Array(jpeg);
      if (key.endsWith(".png")) return new Uint8Array(png);
      throw new Error("missing");
    };

    const model = await db.run((tx) => buildReportModel(tx, ctxOf(PEOPLE.admin, "ADMIN"), WO, { readBlob, now: new Date("2025-01-01T12:00:00Z") }));
    expect(model.number).toBe("WO-000012");
    expect(model.parts).toEqual([{ name: "Filtro hidráulico", quantity: 1, unit: "un", unitCostCents: 12_000 }]);
    expect(model.costs?.laborCents).toBe(17_000);
    expect(model.photos).toHaveLength(1);
    expect(model.signature.image?.format).toBe("png");
    expect(model.signature.signerName).toBe("João");
    expect(reads.some((key) => key.endsWith("_thumb.jpg"))).toBe(true);

    const pdf = await renderWorkOrderReport(model, labels);
    expect(Buffer.from(pdf.subarray(0, 5)).toString("latin1")).toBe("%PDF-");
    expect(pdf.byteLength).toBeGreaterThan(1_000);
  }, 30_000);

  it("hides labour from managers when the setting is off and costs entirely on request", async () => {
    await db.raw("organizations").updateOne({ _id: ORG_A }, { $set: { "settings.showLaborCostToManager": false } });
    const model = await db.run((tx) => buildReportModel(tx, ctxOf(PEOPLE.manager, "MANAGER"), WO, { readBlob: async () => Promise.reject(new Error("missing")) }));
    expect(model.costs?.laborCents).toBeNull();
    expect(model.photos).toHaveLength(0);
    expect(model.photoCount).toBeGreaterThanOrEqual(1);
    const hidden = await db.run((tx) => buildReportModel(tx, ctxOf(PEOPLE.admin, "ADMIN"), WO, { includeCosts: false, readBlob: async () => Promise.reject(new Error("missing")) }));
    expect(hidden.costs).toBeNull();
    expect(hidden.parts[0]?.unitCostCents).toBeNull();
    const pdf = await renderWorkOrderReport(hidden, labels);
    expect(pdf.byteLength).toBeGreaterThan(500);
  }, 30_000);
});
