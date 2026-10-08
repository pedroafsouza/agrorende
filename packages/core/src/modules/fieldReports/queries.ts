import type { ActivityEventDTO, MediaDTO } from "@agrorende/contracts/dto";
import type { ActivityEvent, FieldReport, Media } from "@agrorende/db";

import type { Ctx } from "../../context.js";
import { reject } from "../../errors.js";
import { clampLimit, escapeRegex, pageOf, parseCursor, parseInput, readDb, toDto, type Page } from "../assets/kit.js";
import { toMediaDto } from "../media/dto.js";
import { FieldReportListFilterSchema, type FieldReportDetail, type FieldReportListFilter, type FieldReportListItem, type OpenWorkOrderSummary } from "./dto.js";
import { ACTIVE_WORK_ORDER_STATUSES, toFieldReportDto } from "./service.js";

type ScopedDb = Awaited<ReturnType<typeof readDb>>;

function dayBoundary(value: string, end: boolean): Date {
  if (/^\d{4}-\d{2}-\d{2}$/u.test(value)) return new Date(`${value}T${end ? "23:59:59.999" : "00:00:00.000"}Z`);
  return new Date(value);
}

function uniq(values: readonly (string | null | undefined)[]): string[] {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.length > 0))];
}

async function enrich(db: ScopedDb, docs: readonly FieldReport[]): Promise<FieldReportListItem[]> {
  if (docs.length === 0) return [];
  const assetIds = uniq(docs.map((doc) => doc.assetId));
  const userIds = uniq(docs.map((doc) => doc.reporterId));
  const siteIds = uniq(docs.map((doc) => doc.siteId));
  const reportIds = docs.map((doc) => doc._id);
  const [assets, users, sites, media] = await Promise.all([
    assetIds.length === 0 ? [] : db.assets.find({ _id: { $in: assetIds } }, { projection: { _id: 1, code: 1, name: 1 } }).toArray(),
    db.users.find({ _id: { $in: userIds } }, { projection: { _id: 1, name: 1 } }).toArray(),
    siteIds.length === 0 ? [] : db.sites.find({ _id: { $in: siteIds } }, { projection: { _id: 1, name: 1 } }).toArray(),
    db.media
      .find({ "parent.type": "FIELD_REPORT", "parent.id": { $in: reportIds }, deletedAt: null }, { projection: { _id: 1, parent: 1, kind: 1, capturedAt: 1 } })
      .sort({ capturedAt: 1, _id: 1 })
      .toArray(),
  ]);
  const assetById = new Map(assets.map((asset) => [asset._id, asset]));
  const userById = new Map(users.map((user) => [user._id, user]));
  const siteById = new Map(sites.map((site) => [site._id, site]));
  const mediaByReport = new Map<string, Pick<Media, "_id" | "kind">[]>();
  for (const item of media as Media[]) {
    const list = mediaByReport.get(item.parent.id) ?? [];
    list.push(item);
    mediaByReport.set(item.parent.id, list);
  }
  return docs.map((doc) => {
    const asset = doc.assetId === null || doc.assetId === undefined ? undefined : assetById.get(doc.assetId);
    const site = doc.siteId === null || doc.siteId === undefined ? undefined : siteById.get(doc.siteId);
    const items = mediaByReport.get(doc._id) ?? [];
    const cover = items.find((item) => item.kind === "PHOTO") ?? null;
    return {
      ...toFieldReportDto(doc),
      assetCode: asset?.code ?? null,
      assetName: asset?.name ?? null,
      siteName: site?.name ?? null,
      reporterName: userById.get(doc.reporterId)?.name ?? null,
      mediaCount: items.length,
      coverMediaId: cover?._id ?? null,
    };
  });
}

/**
 * Triage inbox (FR-10, F1 web). Default order: newest first, with CRITICAL and not-operable reports on top
 * of the open queue. Filters: status/priority (comma lists), site, asset, reporter, period and free text.
 */
export async function listFieldReports(ctx: Pick<Ctx, "orgId">, raw: Partial<FieldReportListFilter> = {}): Promise<Page<FieldReportListItem>> {
  const f = parseInput(FieldReportListFilterSchema, raw);
  const db = await readDb(ctx);
  const filter: Record<string, unknown> = { deletedAt: null };
  if (f.status.length > 0) filter.status = { $in: f.status };
  if (f.priority.length > 0) filter.priority = { $in: f.priority };
  if (f.siteId !== undefined) filter.siteId = f.siteId;
  if (f.assetId !== undefined) filter.assetId = f.assetId;
  if (f.reporterId !== undefined) filter.reporterId = f.reporterId;
  if (f.from !== undefined || f.to !== undefined) {
    filter.occurredAt = {
      ...(f.from === undefined ? {} : { $gte: dayBoundary(f.from, false) }),
      ...(f.to === undefined ? {} : { $lte: dayBoundary(f.to, true) }),
    };
  }
  if (f.q !== undefined && f.q.trim().length > 0) {
    const pattern = new RegExp(escapeRegex(f.q.trim()), "iu");
    const assets = await db.assets.find({ $or: [{ code: pattern }, { name: pattern }] }, { projection: { _id: 1 } }).limit(200).toArray();
    filter.$or = [
      { number: pattern },
      { title: pattern },
      { description: pattern },
      { unregisteredAssetDesc: pattern },
      ...(assets.length === 0 ? [] : [{ assetId: { $in: assets.map((asset) => asset._id) } }]),
    ];
  }
  const offset = parseCursor(f.cursor);
  const limit = clampLimit(f.limit);
  const docs: FieldReport[] = await db.field_reports
    .find(filter)
    .sort({ occurredAt: -1, _id: -1 })
    .skip(offset)
    .limit(limit + 1)
    .toArray();
  const page = pageOf(docs, offset, limit);
  return { items: await enrich(db, page.items), nextCursor: page.nextCursor };
}

function activityDto(row: ActivityEvent): ActivityEventDTO {
  return toDto<ActivityEventDTO>(row as unknown as { _id: string; syncVersion: number } & Record<string, unknown>);
}

/** Report detail for the office (FR-10): media gallery, map pin, asset, reporter, linked WO/rental and history. */
export async function getFieldReportDetail(ctx: Pick<Ctx, "orgId">, id: string): Promise<FieldReportDetail> {
  const db = await readDb(ctx);
  const doc = await db.field_reports.findOne({ _id: id, deletedAt: null });
  if (doc === null) return reject("NOT_FOUND", { entityType: "FIELD_REPORT", id });
  const [item] = await enrich(db, [doc]);
  const mediaFilter =
    doc.damageId === null || doc.damageId === undefined
      ? { "parent.type": "FIELD_REPORT", "parent.id": id, deletedAt: null }
      : { $or: [{ "parent.type": "FIELD_REPORT", "parent.id": id }, { damageId: doc.damageId }], deletedAt: null };
  const [media, asset, reporter, site, plot, rental, workOrder, openWo, events] = await Promise.all([
    db.media.find(mediaFilter).sort({ capturedAt: 1, _id: 1 }).toArray(),
    doc.assetId === null || doc.assetId === undefined ? null : db.assets.findOne({ _id: doc.assetId }),
    db.users.findOne({ _id: doc.reporterId }, { projection: { _id: 1, name: 1, phone: 1 } }),
    doc.siteId === null || doc.siteId === undefined ? null : db.sites.findOne({ _id: doc.siteId }, { projection: { _id: 1, name: 1 } }),
    doc.plotId === null || doc.plotId === undefined ? null : db.plots.findOne({ _id: doc.plotId }, { projection: { _id: 1, name: 1 } }),
    doc.rentalId === null || doc.rentalId === undefined ? null : db.rentals.findOne({ _id: doc.rentalId }, { projection: { _id: 1, number: 1, status: 1 } }),
    doc.workOrderId === null || doc.workOrderId === undefined ? null : db.work_orders.findOne({ _id: doc.workOrderId }),
    doc.assetId === null || doc.assetId === undefined || doc.workOrderId !== null
      ? null
      : db.work_orders.findOne({ assetId: doc.assetId, deletedAt: null, status: { $in: [...ACTIVE_WORK_ORDER_STATUSES] } }, { sort: { createdAt: -1 } }),
    db.activity_events.find({ entityType: "FIELD_REPORT", entityId: id }).sort({ occurredAt: 1, _id: 1 }).limit(200).toArray(),
  ]);
  let openWorkOrder: OpenWorkOrderSummary | null = null;
  if (openWo !== null) {
    const assignee = openWo.assigneeId === null || openWo.assigneeId === undefined ? null : await db.users.findOne({ _id: openWo.assigneeId }, { projection: { _id: 1, name: 1 } });
    openWorkOrder = {
      id: openWo._id,
      number: openWo.number,
      title: openWo.title,
      status: openWo.status,
      priority: openWo.priority,
      assigneeId: openWo.assigneeId ?? null,
      assigneeName: assignee?.name ?? null,
      updatedAt: openWo.updatedAt.toISOString(),
    };
  }
  if (item === undefined) return reject("NOT_FOUND", { entityType: "FIELD_REPORT", id });
  return {
    ...item,
    media: media.map((row): MediaDTO => toMediaDto(row)),
    asset: asset === null ? null : { id: asset._id, code: asset.code, name: asset.name, condition: asset.condition, category: asset.category },
    reporter: reporter === null ? null : { id: reporter._id, name: reporter.name, phone: reporter.phone ?? null },
    site: site === null ? null : { id: site._id, name: site.name },
    plot: plot === null ? null : { id: plot._id, name: plot.name },
    rental: rental === null ? null : { id: rental._id, number: rental.number, status: rental.status },
    workOrder: workOrder === null ? null : { id: workOrder._id, number: workOrder.number, status: workOrder.status, assigneeId: workOrder.assigneeId ?? null },
    openWorkOrder,
    activity: events.map(activityDto),
  };
}

/** Count of reports waiting for triage (SUBMITTED + IN_REVIEW), used by the inbox header. */
export async function countOpenReports(ctx: Pick<Ctx, "orgId">): Promise<number> {
  const db = await readDb(ctx);
  const rows = await db.field_reports.find({ deletedAt: null, status: { $in: ["SUBMITTED", "IN_REVIEW"] } }, { projection: { _id: 1 } }).limit(1000).toArray();
  return rows.length;
}
