import { collections, getDb } from "@agrorende/db";
import { z } from "zod";

import type { Ctx } from "../../context";
import { reject } from "../../errors";
import { parseInput } from "./kit";
import type { Db } from "../locations/types";

/**
 * Printable QR label sheet (PLT-06, `POST /assets/qr-sheet`): an A4 PDF with 3 × 10 labels per
 * page, each carrying the asset QR (`agrorende://a/<code>`, the same payload as the single PNG
 * label), the asset code and its name. `packages/core` has no QR encoder dependency, so the
 * caller passes one in (the web route uses `qrcode`); the module draws every QR as one SVG path.
 */

export interface QrMatrix {
  readonly size: number;
  isDark(row: number, col: number): boolean;
}

export type QrEncoder = (text: string) => QrMatrix;

export interface QrLabel {
  readonly code: string;
  readonly name: string;
  readonly payload: string;
  readonly matrix: QrMatrix;
}

export const QR_SHEET_MAX_ASSETS = 300;
export const QR_LABELS_PER_PAGE = 30;
const QUIET_ZONE = 2;

export const QrSheetRequestSchema = z.object({
  assetIds: z.array(z.string().uuid()).min(1).max(QR_SHEET_MAX_ASSETS),
});

export function assetQrPayload(code: string): string {
  return `agrorende://a/${code}`;
}

// ───────── Element factory (react-pdf primitives, no React import; see rentals/pdf.ts) ─────────

export interface QrPdfNode {
  readonly $$typeof: symbol;
  readonly type: string;
  readonly key: string | null;
  readonly ref: null;
  readonly props: Record<string, unknown>;
}

type Child = QrPdfNode | string | null | readonly Child[];
const ELEMENT = Symbol.for("react.transitional.element");

function h(type: "DOCUMENT" | "PAGE" | "VIEW" | "TEXT" | "SVG" | "PATH", props: Record<string, unknown> | null, ...children: Child[]): QrPdfNode {
  const flat = children.flat(2).filter((child) => child !== null);
  const keyed = flat.map((child, index) => (typeof child === "object" && child !== null && "type" in child ? { ...child, key: child.key ?? String(index) } : child));
  return {
    $$typeof: ELEMENT,
    type,
    key: null,
    ref: null,
    props: { ...(props ?? {}), ...(keyed.length === 0 ? {} : { children: keyed.length === 1 ? keyed[0] : keyed }) },
    _owner: null,
    _store: { validated: 1 },
  } as QrPdfNode;
}

/** One closed sub-path per dark module, offset by the quiet zone. */
export function qrPath(matrix: QrMatrix): string {
  const parts: string[] = [];
  for (let row = 0; row < matrix.size; row += 1) {
    for (let col = 0; col < matrix.size; col += 1) {
      if (matrix.isDark(row, col)) parts.push(`M${col + QUIET_ZONE} ${row + QUIET_ZONE}h1v1h-1z`);
    }
  }
  return parts.join("");
}

const styles = {
  page: { paddingTop: 22, paddingBottom: 22, paddingHorizontal: 14, flexDirection: "row", flexWrap: "wrap", fontFamily: "Helvetica", color: "#1F2A1C" },
  label: { width: "33.33%", height: 79.5, flexDirection: "row", alignItems: "center", paddingHorizontal: 6, borderWidth: 0.5, borderStyle: "dashed", borderColor: "#C9D3C2" },
  text: { flexGrow: 1, flexShrink: 1, marginLeft: 6 },
  code: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  name: { fontSize: 8, marginTop: 2, color: "#4A5A44" },
} as const;

export function qrSheetDocument(labels: readonly QrLabel[]): QrPdfNode {
  const pages: QrLabel[][] = [];
  for (let i = 0; i < labels.length; i += QR_LABELS_PER_PAGE) pages.push(labels.slice(i, i + QR_LABELS_PER_PAGE));
  return h(
    "DOCUMENT",
    { title: "AgroRende QR", creator: "AgroRende", producer: "AgroRende" },
    pages.map((page) =>
      h(
        "PAGE",
        { size: "A4", style: styles.page },
        page.map((label) => {
          const box = label.matrix.size + QUIET_ZONE * 2;
          return h(
            "VIEW",
            { style: styles.label, wrap: false },
            h("SVG", { width: 66, height: 66, viewBox: `0 0 ${box} ${box}` }, h("PATH", { d: qrPath(label.matrix), fill: "#000000" })),
            h("VIEW", { style: styles.text }, h("TEXT", { style: styles.code }, label.code), h("TEXT", { style: styles.name }, label.name)),
          );
        }),
      ),
    ),
  );
}

export interface QrSheetDeps {
  readonly db?: Db;
  readonly dbName?: string;
  readonly render?: (node: QrPdfNode) => Promise<Uint8Array>;
}

export interface QrSheetResult {
  readonly bytes: Uint8Array;
  readonly labels: readonly QrLabel[];
}

/** Loads the requested assets of the caller's organisation in request order and renders the sheet. */
export async function renderQrSheet(ctx: Pick<Ctx, "orgId">, raw: unknown, encode: QrEncoder, deps: QrSheetDeps = {}): Promise<QrSheetResult> {
  const input = parseInput(QrSheetRequestSchema, raw);
  const db = deps.db ?? (await getDb(deps.dbName));
  const ids = [...new Set(input.assetIds)];
  const assets = await collections
    .assets(db)
    .find({ organizationId: ctx.orgId, _id: { $in: ids }, deletedAt: null }, { projection: { code: 1, name: 1 } })
    .toArray();
  if (assets.length === 0) return reject("NOT_FOUND", { entityType: "ASSET" });
  const byId = new Map(assets.map((asset) => [asset._id, asset]));
  const labels = ids.flatMap((id) => {
    const asset = byId.get(id);
    if (asset === undefined) return [];
    const payload = assetQrPayload(asset.code);
    return [{ code: asset.code, name: asset.name, payload, matrix: encode(payload) }];
  });
  const render = deps.render ?? (async (node: QrPdfNode) => (await import("../../pdf/index")).renderPdfNode(node as never));
  return { bytes: await render(qrSheetDocument(labels)), labels };
}
