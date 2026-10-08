import { collections, getDb } from "@agrorende/db";
import type { ChecklistItem, ChecklistResponse } from "@agrorende/contracts";
import type { Tx } from "@agrorende/contracts/seams";

import type { Ctx } from "../../context.js";
import { mediaStore } from "../../storage/index.js";
import { dbTx } from "../assets/kit.js";
import { variantKey } from "../media/upload.js";
import { detail } from "./queries.js";

/** At most this many photos are embedded so the report stays a few hundred kilobytes. */
export const REPORT_MAX_PHOTOS = 8;

export interface ReportImage {
  readonly data: Uint8Array;
  readonly format: "jpg" | "png";
  readonly tag: string;
  readonly caption: string | null;
  readonly capturedAt: string;
}

export interface ReportChecklistRow {
  readonly key: string;
  readonly label: string;
  readonly value: string | null;
  readonly note: string | null;
  readonly isSafetyCritical: boolean;
}

export interface ReportPartRow {
  readonly name: string;
  readonly quantity: number;
  readonly unit: string;
  readonly unitCostCents: number | null;
}

export interface ReportTimelineRow {
  readonly action: string;
  readonly toStatus: string | null;
  readonly actorName: string | null;
  readonly occurredAt: string;
}

/**
 * Everything the service report (WO-24) prints, already resolved and permission-filtered. The PDF renderer in
 * `pdf/workOrderReport.tsx` only formats it; labels come from the caller in the job's `documentLocale`.
 */
export interface WorkOrderReportModel {
  readonly locale: string;
  readonly timezone: string;
  readonly currency: string;
  readonly organizationName: string;
  readonly number: string;
  readonly title: string;
  readonly type: string;
  readonly priority: string;
  readonly status: string;
  readonly description: string | null;
  readonly resolution: string | null;
  readonly rootCause: string | null;
  readonly assetName: string | null;
  readonly assetCode: string | null;
  readonly customerName: string | null;
  readonly siteName: string | null;
  readonly assigneeName: string | null;
  readonly verifiedByName: string | null;
  readonly hourMeterReading: number | null;
  readonly createdAt: string;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly verifiedAt: string | null;
  readonly travelMinutes: number | null;
  readonly workMinutes: number | null;
  readonly checklist: readonly ReportChecklistRow[];
  readonly parts: readonly ReportPartRow[];
  /** `null` when the caller may not see costs (ARCHITECTURE §15) or chose to hide them. */
  readonly costs: { readonly laborCents: number | null; readonly partsCents: number | null; readonly externalCents: number | null } | null;
  readonly photos: readonly ReportImage[];
  readonly photoCount: number;
  readonly signature: {
    readonly status: string | null;
    readonly signerName: string | null;
    readonly witnessName: string | null;
    readonly reason: string | null;
    readonly image: ReportImage | null;
  };
  readonly timeline: readonly ReportTimelineRow[];
  readonly generatedAt: string;
}

/**
 * Translated strings for the WO-24 service report. The caller (the web route) resolves them from
 * `messages/<documentLocale>/jobs.json` so core stays free of locale files (R9).
 */
export interface WorkOrderReportLabels {
  readonly title: string;
  readonly number: string;
  readonly generatedAt: string;
  readonly asset: string;
  readonly customer: string;
  readonly site: string;
  readonly assignee: string;
  readonly type: string;
  readonly priority: string;
  readonly status: string;
  readonly createdAt: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly verifiedAt: string;
  readonly verifiedBy: string;
  readonly travelTime: string;
  readonly workTime: string;
  readonly minutesSuffix: string;
  readonly hourMeter: string;
  readonly description: string;
  readonly resolution: string;
  readonly rootCause: string;
  readonly checklist: string;
  readonly safetyCritical: string;
  readonly parts: string;
  readonly partName: string;
  readonly quantity: string;
  readonly unitCost: string;
  readonly costs: string;
  readonly labor: string;
  readonly partsCost: string;
  readonly external: string;
  readonly total: string;
  readonly photos: string;
  readonly morePhotos: string;
  readonly signature: string;
  readonly signer: string;
  readonly witness: string;
  readonly signatureReason: string;
  readonly timeline: string;
  readonly none: string;
  /** Translates an enum value; `group` is `workOrderStatus`, `workOrderType`, `priority`, `signatureStatus`, `checklistValue` or `mediaTag`. */
  readonly enumLabel: (group: string, value: string) => string;
}


export interface BuildReportOptions {
  readonly includeCosts?: boolean;
  /** Injected in tests; defaults to the configured media store. */
  readonly readBlob?: (key: string) => Promise<Uint8Array>;
  readonly now?: Date;
}

function localizedLabel(label: unknown, locale: string): string {
  if (typeof label === "string") return label;
  if (typeof label === "object" && label !== null) {
    const map = label as Record<string, unknown>;
    const value = map[locale] ?? map["pt-BR"] ?? Object.values(map)[0];
    if (typeof value === "string") return value;
  }
  return "";
}

function imageFormat(mimeType: string): "jpg" | "png" | null {
  const mime = mimeType.toLowerCase();
  if (mime === "image/png") return "png";
  if (mime === "image/jpeg" || mime === "image/jpg") return "jpg";
  return null;
}

/** Builds the WO-24 report for office roles. Missing image files are skipped so a lost blob never blocks the PDF. */
export async function buildReportModel(tx: Tx, ctx: Ctx, id: string, options: BuildReportOptions = {}): Promise<WorkOrderReportModel> {
  const scoped = dbTx(tx);
  const view = await detail(tx, ctx, id);
  const wo = view.workOrder;
  const locale = wo.documentLocale.length > 0 ? wo.documentLocale : "pt-BR";
  const read = options.readBlob ?? ((key: string) => mediaStore().get(key));

  const org = await collections.organizations(await getDb()).findOne({ _id: ctx.orgId }, { projection: { name: 1, timezone: 1, currency: 1 } });
  const asset = wo.assetId == null ? null : await scoped.db.assets.findOne({ _id: wo.assetId }, { projection: { name: 1, code: 1 } });
  const customer = wo.customerId == null ? null : await scoped.db.customers.findOne({ _id: wo.customerId }, { projection: { name: 1 } });
  const site = wo.siteId == null ? null : await scoped.db.sites.findOne({ _id: wo.siteId }, { projection: { name: 1 } });

  const responses = new Map<string, ChecklistResponse>((wo.checklistResponses ?? []).map((response) => [response.key, response]));
  const checklist = ((wo.checklistSnapshot ?? []) as ChecklistItem[]).map((item) => {
    const response = responses.get(item.key);
    const value = response?.value;
    return {
      key: item.key,
      label: localizedLabel(item.label, locale),
      value: value === undefined || value === null ? null : String(value),
      note: response?.note ?? null,
      isSafetyCritical: item.isSafetyCritical === true,
    };
  });

  const mediaRows = await scoped.db.media
    .find({ "parent.type": "WORK_ORDER", "parent.id": id, deletedAt: null, kind: { $in: ["PHOTO", "SIGNATURE"] }, status: { $in: ["UPLOADED", "PROCESSED"] } }, { sort: { capturedAt: 1 } })
    .toArray();
  const photos: ReportImage[] = [];
  let signatureImage: ReportImage | null = null;
  for (const media of mediaRows) {
    const isSignature = media._id === wo.signatureMediaId || media.kind === "SIGNATURE";
    if (!isSignature && photos.length >= REPORT_MAX_PHOTOS) continue;
    const useThumb = !isSignature;
    const format = useThumb ? "jpg" : imageFormat(media.mimeType);
    if (format === null) continue;
    try {
      const data = await read(variantKey(media, useThumb ? "thumb" : "original"));
      const image: ReportImage = { data, format, tag: media.tag, caption: media.caption ?? null, capturedAt: media.capturedAt.toISOString() };
      if (isSignature) signatureImage = image;
      else photos.push(image);
    } catch {
      // A missing thumbnail must not block the report; the photo count below still tells the reader.
    }
  }

  const costs =
    options.includeCosts === false
      ? null
      : {
          laborCents: view.canSeeLaborCost ? (wo.laborCostCents ?? null) : null,
          partsCents: wo.partsCostCents ?? null,
          externalCents: wo.externalCostCents ?? null,
        };

  return {
    locale,
    timezone: typeof org?.timezone === "string" ? org.timezone : "America/Sao_Paulo",
    currency: typeof org?.currency === "string" ? org.currency : "BRL",
    organizationName: org?.name ?? "",
    number: wo.number,
    title: wo.title,
    type: wo.type,
    priority: wo.priority,
    status: wo.status,
    description: wo.description ?? null,
    resolution: wo.resolution ?? null,
    rootCause: wo.rootCause ?? null,
    assetName: asset?.name ?? null,
    assetCode: typeof asset?.code === "string" ? asset.code : null,
    customerName: customer?.name ?? null,
    siteName: site?.name ?? null,
    assigneeName: wo.assigneeId == null ? null : (view.names[wo.assigneeId] ?? null),
    verifiedByName: wo.verifiedById == null ? null : (view.names[wo.verifiedById] ?? null),
    hourMeterReading: wo.hourMeterReading ?? null,
    createdAt: wo.createdAt,
    startedAt: wo.startedAt ?? null,
    completedAt: wo.completedAt ?? null,
    verifiedAt: wo.verifiedAt ?? null,
    travelMinutes: wo.travelMinutes ?? null,
    workMinutes: wo.workMinutes ?? null,
    checklist,
    parts: view.parts.map((part) => ({ name: part.name, quantity: part.quantity, unit: part.unit, unitCostCents: costs === null ? null : (part.unitCostCents ?? null) })),
    costs,
    photos,
    photoCount: mediaRows.filter((media) => media._id !== wo.signatureMediaId && media.kind !== "SIGNATURE").length,
    signature: {
      status: wo.signatureStatus ?? null,
      signerName: wo.customerSignerName ?? null,
      witnessName: wo.signatureWitnessName ?? null,
      reason: wo.signatureReason ?? null,
      image: signatureImage,
    },
    timeline: view.timeline
      .filter((entry) => entry.toStatus !== null)
      .map((entry) => ({ action: entry.action, toStatus: entry.toStatus, actorName: entry.actorName, occurredAt: entry.occurredAt })),
    generatedAt: (options.now ?? new Date()).toISOString(),
  };
}

type RenderReport = (model: WorkOrderReportModel, labels: WorkOrderReportLabels) => Promise<Uint8Array>;

/**
 * Renders the PDF through `pdf/workOrderReport.tsx`. The lazy import keeps `@react-pdf/renderer` out of every other
 * code path.
 */
export async function renderReportPdf(model: WorkOrderReportModel, labels: WorkOrderReportLabels): Promise<Uint8Array> {
  const module = (await import("../../pdf/workOrderReport.js")) as { renderWorkOrderReport: RenderReport };
  return module.renderWorkOrderReport(model, labels);
}
