import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closeClient, collections } from "@agrorende/db";
import { setupTestDb, type TestDbHandle } from "@agrorende/db/testing";

import { DomainError } from "../../errors";
import { assetQrPayload, qrPath, qrSheetDocument, renderQrSheet, QR_LABELS_PER_PAGE, type QrEncoder, type QrPdfNode } from "./qrSheet";

const ORG = "0190f5a0-0000-7000-8000-0000000d2001";
const OTHER = "0190f5a0-0000-7000-8000-0000000d2002";

let seq = 0;
function uid(): string {
  seq += 1;
  return `0190f5a0-0000-7000-8000-${String(800_000 + seq).padStart(12, "0")}`;
}

/** Deterministic stand-in for `qrcode`: a 21 × 21 matrix whose dark cells encode the text length. */
const fakeEncoder: QrEncoder = (text) => ({ size: 21, isDark: (row, col) => (row * 21 + col + text.length) % 3 === 0 });

function nodes(node: unknown, type: string): QrPdfNode[] {
  if (Array.isArray(node)) return node.flatMap((child) => nodes(child, type));
  if (typeof node !== "object" || node === null || !("type" in node)) return [];
  const el = node as QrPdfNode;
  return [...(el.type === type ? [el] : []), ...nodes(el.props.children, type)];
}

let handle: TestDbHandle;

describe("QR label sheet", () => {
  beforeAll(async () => {
    process.env.MONGODB_URI ??= "mongodb://localhost:27017/?directConnection=true";
    handle = await setupTestDb("agrorende_t16_qr");
  });

  afterAll(async () => {
    await handle.drop();
    await closeClient();
  });

  beforeEach(async () => {
    await handle.truncate();
  });

  async function seedAssets(count: number, orgId = ORG): Promise<string[]> {
    const now = new Date();
    const docs = Array.from({ length: count }, (_, i) => ({
      _id: uid(),
      organizationId: orgId,
      syncVersion: 1,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      code: `TR-${String(i + 1).padStart(3, "0")}`,
      name: `Trator ${i + 1}`,
      category: "TRACTOR",
      condition: "OPERATIONAL",
    }));
    await collections.assets(handle.db).insertMany(docs as never);
    return docs.map((doc) => doc._id);
  }

  it("draws one path per dark module inside the quiet zone", () => {
    const path = qrPath({ size: 2, isDark: (row, col) => row === col });
    expect(path).toBe("M2 2h1v1h-1zM3 3h1v1h-1z");
  });

  it("renders 30 labels on one A4 page with the asset payload, code and name", async () => {
    const ids = await seedAssets(30);
    const result = await renderQrSheet({ orgId: ORG }, { assetIds: ids }, fakeEncoder, { db: handle.db });
    expect(result.labels).toHaveLength(30);
    expect(result.labels[0]).toMatchObject({ code: "TR-001", name: "Trator 1", payload: "agrorende://a/TR-001" });
    const tree = qrSheetDocument(result.labels);
    expect(nodes(tree, "PAGE")).toHaveLength(1);
    expect(nodes(tree, "PATH")).toHaveLength(30);
    const pdf = Buffer.from(result.bytes).toString("latin1");
    expect(pdf.startsWith("%PDF-")).toBe(true);
    expect(pdf.match(/\/Type \/Page\b/gu)).toHaveLength(1);
  }, 30_000);

  it("starts a new page after 30 labels and skips other tenants' assets", async () => {
    const ids = await seedAssets(31);
    const [foreign] = await seedAssets(1, OTHER);
    const result = await renderQrSheet({ orgId: ORG }, { assetIds: [...ids, foreign] }, fakeEncoder, { db: handle.db, render: async () => new Uint8Array() });
    expect(result.labels).toHaveLength(31);
    expect(nodes(qrSheetDocument(result.labels), "PAGE")).toHaveLength(Math.ceil(31 / QR_LABELS_PER_PAGE));
  });

  it("rejects an empty selection and a selection with no visible asset", async () => {
    await expect(renderQrSheet({ orgId: ORG }, { assetIds: [] }, fakeEncoder, { db: handle.db })).rejects.toSatisfy(
      (e) => (e as { code?: string }).code === "VALIDATION_FAILED",
    );
    const [foreign] = await seedAssets(1, OTHER);
    await expect(renderQrSheet({ orgId: ORG }, { assetIds: [foreign] }, fakeEncoder, { db: handle.db })).rejects.toSatisfy(
      (e) => e instanceof DomainError && e.code === "NOT_FOUND",
    );
  });

  it("uses the single-label payload", () => {
    expect(assetQrPayload("TR-001")).toBe("agrorende://a/TR-001");
  });
});
