import { z } from "zod";
import { AssetCategoryEnum, MaintenanceTriggerEnum, type AssetCategory, type MaintenanceTrigger } from "@agrorende/contracts/enums";
import type { AssetSummary, Tx } from "@agrorende/contracts/seams";

import type { Ctx } from "../../context";
import { reject } from "../../errors";
import { createNotification, officeRecipients } from "../../notify/index";
import { assetSeams, workOrderSeams } from "../../seams";
import type { SyncTx } from "../../sync/types";
import { assertVersion, dbTx, newId, parseInput, readDb, stampCreate, stampUpdate, toDto, writeActivity } from "../assets/kit";
import { dueAtFor, slaSettingsOf } from "../workOrders/sla";
import type { MaintenanceDueRow, MaintenancePlanDTO, MaintenancePlanRow } from "./dto";

/**
 * Preventive maintenance plans (ERP-06, ARCHITECTURE §8 "Maintenance" and §10 `maintenance.dueScan`).
 * A plan targets one asset or every asset of a category. "Last done" comes from the latest
 * completed preventive work order of the plan (`workOrders.maintenanceStatus`), falling back to
 * `plan.lastDone*`. When the next due point (hours or date) is inside the lead window, the scan
 * opens one PREVENTIVE work order per plan and asset through `workOrders.createFromSource`.
 */

const DAY_MS = 86_400_000;
const OFFICE_ROLES: readonly string[] = ["ADMIN", "MANAGER"];

function requireOfficeRole(ctx: Pick<Ctx, "role">): void {
  if (!OFFICE_ROLES.includes(ctx.role)) reject("OFFICE_ROLE_REQUIRED", { role: ctx.role });
}

const PlanFieldsSchema = z.object({
  name: z.string().trim().min(1).max(200),
  assetId: z.string().uuid().nullable().optional(),
  assetCategory: AssetCategoryEnum.nullable().optional(),
  trigger: MaintenanceTriggerEnum,
  intervalHours: z.number().positive().nullable().optional(),
  intervalDays: z.number().int().positive().nullable().optional(),
  lastDoneHourMeter: z.number().nonnegative().nullable().optional(),
  lastDoneAt: z.string().datetime({ offset: true }).nullable().optional(),
  leadHours: z.number().nonnegative().default(25),
  leadDays: z.number().int().nonnegative().default(7),
  checklistTemplateId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().default(true),
});

type PlanFields = z.output<typeof PlanFieldsSchema>;

function refinePlan(value: Pick<PlanFields, "assetId" | "assetCategory" | "trigger" | "intervalHours" | "intervalDays">, issue: z.RefinementCtx): void {
  const hasAsset = (value.assetId ?? null) !== null;
  const hasCategory = (value.assetCategory ?? null) !== null;
  if (hasAsset === hasCategory) issue.addIssue({ code: "custom", path: ["assetId"], message: "asset_or_category" });
  if (value.trigger !== "CALENDAR" && (value.intervalHours ?? null) === null) issue.addIssue({ code: "custom", path: ["intervalHours"], message: "required" });
  if (value.trigger !== "HOURS" && (value.intervalDays ?? null) === null) issue.addIssue({ code: "custom", path: ["intervalDays"], message: "required" });
}

export const MaintenancePlanCreateInputSchema = PlanFieldsSchema.superRefine(refinePlan);
export type MaintenancePlanCreateInput = z.input<typeof MaintenancePlanCreateInputSchema>;

export const MaintenancePlanPatchInputSchema = PlanFieldsSchema.partial().extend({
  leadHours: z.number().nonnegative().optional(),
  leadDays: z.number().int().nonnegative().optional(),
  isActive: z.boolean().optional(),
});
export type MaintenancePlanPatchInput = z.input<typeof MaintenancePlanPatchInputSchema>;

export interface PlanDoc {
  readonly _id: string;
  readonly syncVersion: number;
  readonly createdAt: Date;
  readonly name: string;
  readonly assetId?: string | null;
  readonly assetCategory?: AssetCategory | null;
  readonly trigger: MaintenanceTrigger;
  readonly intervalHours?: number | null;
  readonly intervalDays?: number | null;
  readonly lastDoneHourMeter?: number | null;
  readonly lastDoneAt?: Date | null;
  readonly nextDueHourMeter?: number | null;
  readonly nextDueAt?: Date | null;
  readonly leadHours?: number;
  readonly leadDays?: number;
  readonly checklistTemplateId?: string | null;
  readonly isActive?: boolean;
}

function planDto(doc: unknown): MaintenancePlanDTO {
  const dto = toDto<MaintenancePlanDTO>(doc as { _id: string; syncVersion: number } & Record<string, unknown>);
  return { ...dto, leadHours: dto.leadHours ?? 25, leadDays: dto.leadDays ?? 7, isActive: dto.isActive ?? true };
}

/** Read-only transaction view for queries outside a write transaction (the seams only read through `tx.db`). */
async function readTx(ctx: Pick<Ctx, "orgId">): Promise<Tx> {
  return { db: await readDb(ctx), orgId: ctx.orgId, syncVersion: 0 };
}

// ───────── Due computation (pure) ─────────

export interface DueBaseline {
  readonly at: Date | null;
  readonly hourMeter: number | null;
}

export interface DuePoint {
  readonly nextDueHourMeter: number | null;
  readonly nextDueAt: Date | null;
  readonly hoursRemaining: number | null;
  readonly daysRemaining: number | null;
  readonly isDue: boolean;
  readonly isOverdue: boolean;
}

/**
 * Next due point of a plan for an asset. Hours: last done + interval; without any baseline the
 * next multiple of the interval above the current reading (the usual 250 h / 500 h service grid).
 * Calendar: last done (or the plan's creation) + interval days. A plan is due inside the lead
 * window; HOURS_OR_CALENDAR is due when either side is.
 */
export function computeDuePoint(plan: PlanDoc, hourMeter: number | null, baseline: DueBaseline, now: Date): DuePoint {
  const usesHours = plan.trigger !== "CALENDAR" && (plan.intervalHours ?? null) !== null;
  const usesDays = plan.trigger !== "HOURS" && (plan.intervalDays ?? null) !== null;
  let nextDueHourMeter: number | null = null;
  if (usesHours) {
    const interval = plan.intervalHours ?? 0;
    if (baseline.hourMeter !== null) nextDueHourMeter = baseline.hourMeter + interval;
    else if (hourMeter !== null) nextDueHourMeter = (Math.floor(hourMeter / interval) + 1) * interval;
  }
  const nextDueAt = usesDays ? new Date((baseline.at ?? plan.createdAt).getTime() + (plan.intervalDays ?? 0) * DAY_MS) : null;
  const hoursRemaining = nextDueHourMeter === null || hourMeter === null ? null : nextDueHourMeter - hourMeter;
  const daysRemaining = nextDueAt === null ? null : Math.floor((nextDueAt.getTime() - now.getTime()) / DAY_MS);
  const leadHours = plan.leadHours ?? 25;
  const leadDays = plan.leadDays ?? 7;
  const hoursDue = hoursRemaining !== null && hoursRemaining <= leadHours;
  const daysDue = nextDueAt !== null && nextDueAt.getTime() - now.getTime() <= leadDays * DAY_MS;
  const hoursOver = hoursRemaining !== null && hoursRemaining <= 0;
  const daysOver = nextDueAt !== null && nextDueAt.getTime() <= now.getTime();
  return { nextDueHourMeter, nextDueAt, hoursRemaining, daysRemaining, isDue: hoursDue || daysDue, isOverdue: hoursOver || daysOver };
}

// ───────── Plans ─────────

async function assertTargets(tx: Tx, fields: Pick<PlanFields, "assetId" | "checklistTemplateId">): Promise<void> {
  const scoped = dbTx(tx);
  const assetId = fields.assetId ?? null;
  if (assetId !== null) {
    const asset = await scoped.db.assets.findOne({ _id: assetId, deletedAt: null }, { projection: { _id: 1 } });
    if (asset === null) reject("NOT_FOUND", { entityType: "ASSET", id: assetId });
  }
  const templateId = fields.checklistTemplateId ?? null;
  if (templateId !== null) {
    const template = await scoped.db.checklist_templates.findOne({ _id: templateId, deletedAt: null }, { projection: { _id: 1 } });
    if (template === null) reject("NOT_FOUND", { entityType: "CHECKLIST_TEMPLATE", id: templateId });
  }
}

/** Plan fields for an asset plan's stored `nextDue*` (category plans keep them null; see `due`). */
async function storedNextDue(tx: Tx, plan: PlanDoc, now: Date): Promise<{ nextDueHourMeter: number | null; nextDueAt: Date | null }> {
  const assetId = plan.assetId ?? null;
  if (assetId === null) return { nextDueHourMeter: null, nextDueAt: null };
  const [row] = await dueRows(tx, plan, now);
  return { nextDueHourMeter: row?.nextDueHourMeter ?? null, nextDueAt: row?.nextDueAt === null || row?.nextDueAt === undefined ? null : new Date(row.nextDueAt) };
}

export async function createPlan(tx: Tx, ctx: Ctx, raw: unknown): Promise<MaintenancePlanDTO> {
  const scoped = dbTx(tx);
  if (scoped.orgId !== ctx.orgId) reject("FORBIDDEN", { orgId: ctx.orgId });
  requireOfficeRole(ctx);
  const input = parseInput(MaintenancePlanCreateInputSchema, raw);
  await assertTargets(tx, input);
  const now = new Date();
  const doc = {
    _id: newId(),
    organizationId: scoped.orgId,
    ...stampCreate(scoped, now),
    deletedAt: null,
    name: input.name,
    assetId: input.assetId ?? null,
    assetCategory: (input.assetId ?? null) === null ? (input.assetCategory ?? null) : null,
    trigger: input.trigger,
    intervalHours: input.trigger === "CALENDAR" ? null : (input.intervalHours ?? null),
    intervalDays: input.trigger === "HOURS" ? null : (input.intervalDays ?? null),
    lastDoneHourMeter: input.lastDoneHourMeter ?? null,
    lastDoneAt: input.lastDoneAt === null || input.lastDoneAt === undefined ? null : new Date(input.lastDoneAt),
    nextDueHourMeter: null as number | null,
    nextDueAt: null as Date | null,
    leadHours: input.leadHours,
    leadDays: input.leadDays,
    checklistTemplateId: input.checklistTemplateId ?? null,
    isActive: input.isActive,
  };
  Object.assign(doc, await storedNextDue(tx, doc, now));
  await scoped.db.maintenance_plans.insertOne(doc);
  await writeActivity(scoped, { entityType: "MAINTENANCE_PLAN", entityId: doc._id, action: "maintenancePlan.create", actorId: ctx.userId, meta: { name: doc.name } });
  return planDto(doc);
}

export async function updatePlan(tx: Tx, ctx: Ctx, id: string, raw: unknown, ifMatch?: string | null): Promise<MaintenancePlanDTO> {
  const scoped = dbTx(tx);
  if (scoped.orgId !== ctx.orgId) reject("FORBIDDEN", { orgId: ctx.orgId });
  requireOfficeRole(ctx);
  const patch = parseInput(MaintenancePlanPatchInputSchema, raw);
  const current = (await scoped.db.maintenance_plans.findOne({ _id: id, deletedAt: null })) as PlanDoc | null;
  if (current === null) return reject("NOT_FOUND", { entityType: "MAINTENANCE_PLAN", id });
  assertVersion(current, ifMatch);
  const merged = {
    name: patch.name ?? current.name,
    assetId: patch.assetId !== undefined ? patch.assetId : (current.assetId ?? null),
    assetCategory: patch.assetCategory !== undefined ? patch.assetCategory : (current.assetCategory ?? null),
    trigger: patch.trigger ?? current.trigger,
    intervalHours: patch.intervalHours !== undefined ? patch.intervalHours : (current.intervalHours ?? null),
    intervalDays: patch.intervalDays !== undefined ? patch.intervalDays : (current.intervalDays ?? null),
    lastDoneHourMeter: patch.lastDoneHourMeter !== undefined ? patch.lastDoneHourMeter : (current.lastDoneHourMeter ?? null),
    lastDoneAt: patch.lastDoneAt !== undefined ? patch.lastDoneAt : (current.lastDoneAt?.toISOString() ?? null),
    leadHours: patch.leadHours ?? current.leadHours ?? 25,
    leadDays: patch.leadDays ?? current.leadDays ?? 7,
    checklistTemplateId: patch.checklistTemplateId !== undefined ? patch.checklistTemplateId : (current.checklistTemplateId ?? null),
    isActive: patch.isActive ?? current.isActive ?? true,
  };
  if (patch.assetId !== undefined && patch.assetId !== null && patch.assetCategory === undefined) merged.assetCategory = null;
  if (patch.assetCategory !== undefined && patch.assetCategory !== null && patch.assetId === undefined) merged.assetId = null;
  const input = parseInput(MaintenancePlanCreateInputSchema, merged);
  await assertTargets(tx, input);
  const now = new Date();
  const next: PlanDoc = {
    ...current,
    name: input.name,
    assetId: input.assetId ?? null,
    assetCategory: (input.assetId ?? null) === null ? (input.assetCategory ?? null) : null,
    trigger: input.trigger,
    intervalHours: input.trigger === "CALENDAR" ? null : (input.intervalHours ?? null),
    intervalDays: input.trigger === "HOURS" ? null : (input.intervalDays ?? null),
    lastDoneHourMeter: input.lastDoneHourMeter ?? null,
    lastDoneAt: input.lastDoneAt === null || input.lastDoneAt === undefined ? null : new Date(input.lastDoneAt),
    leadHours: input.leadHours,
    leadDays: input.leadDays,
    checklistTemplateId: input.checklistTemplateId ?? null,
    isActive: input.isActive,
  };
  const due = await storedNextDue(tx, next, now);
  const { _id: _ignoredId, syncVersion: _ignoredVersion, createdAt: _ignoredCreated, ...fields } = next;
  await scoped.db.maintenance_plans.updateOne({ _id: id }, { $set: { ...fields, ...due, ...stampUpdate(scoped, now) } });
  await writeActivity(scoped, { entityType: "MAINTENANCE_PLAN", entityId: id, action: "maintenancePlan.update", actorId: ctx.userId, meta: { fields: Object.keys(patch) } });
  return planDto(await scoped.db.maintenance_plans.findOne({ _id: id }));
}

async function planAssets(tx: Tx, plan: PlanDoc): Promise<AssetSummary[]> {
  const orgId = dbTx(tx).orgId;
  const assetId = plan.assetId ?? null;
  if (assetId !== null) return assetSeams.listSummaries(tx, orgId, { ids: [assetId] });
  const category = plan.assetCategory ?? null;
  if (category === null) return [];
  return assetSeams.listSummaries(tx, orgId, { category });
}

/** Due rows of one plan, one per target asset. */
export async function dueRows(tx: Tx, plan: PlanDoc, now: Date): Promise<MaintenanceDueRow[]> {
  const assets = (await planAssets(tx, plan)).filter((asset) => asset.condition !== "RETIRED");
  if (assets.length === 0) return [];
  const status = await workOrderSeams.maintenanceStatus(tx, plan._id, assets.map((asset) => asset.id));
  return assets.map((asset) => {
    const entry = status.get(asset.id) ?? { hasOpen: false, lastCompleted: null };
    const baseline: DueBaseline = entry.lastCompleted ?? { at: plan.lastDoneAt ?? null, hourMeter: plan.lastDoneHourMeter ?? null };
    const point = computeDuePoint(plan, asset.hourMeter, { at: baseline.at, hourMeter: baseline.hourMeter ?? (entry.lastCompleted === null ? null : (plan.lastDoneHourMeter ?? null)) }, now);
    return {
      planId: plan._id,
      assetId: asset.id,
      assetCode: asset.code,
      assetName: asset.name,
      category: asset.category,
      trigger: plan.trigger,
      hourMeter: asset.hourMeter,
      lastDoneAt: baseline.at === null ? null : baseline.at.toISOString(),
      lastDoneHourMeter: baseline.hourMeter,
      nextDueHourMeter: point.nextDueHourMeter,
      nextDueAt: point.nextDueAt === null ? null : point.nextDueAt.toISOString(),
      hoursRemaining: point.hoursRemaining,
      daysRemaining: point.daysRemaining,
      isDue: point.isDue,
      isOverdue: point.isOverdue,
      hasOpen: entry.hasOpen,
    };
  });
}

/** `GET /maintenance-plans/:id/due`: next due hour meter and date per asset. */
export async function due(ctx: Ctx, planId: string, now: Date = new Date()): Promise<{ items: MaintenanceDueRow[] }> {
  requireOfficeRole(ctx);
  const tx = await readTx(ctx);
  const plan = (await dbTx(tx).db.maintenance_plans.findOne({ _id: planId, deletedAt: null })) as PlanDoc | null;
  if (plan === null) return reject("NOT_FOUND", { entityType: "MAINTENANCE_PLAN", id: planId });
  const rows = await dueRows(tx, plan, now);
  rows.sort((a, b) => Number(b.isDue) - Number(a.isDue) || (a.hoursRemaining ?? a.daysRemaining ?? 0) - (b.hoursRemaining ?? b.daysRemaining ?? 0));
  return { items: rows };
}

export interface PlanListFilter {
  readonly assetId?: string | null;
  readonly includeInactive?: boolean | string | null;
}

/** `GET /maintenance-plans`, with the target asset and how many assets are due now. */
export async function listPlans(ctx: Ctx, filter: PlanListFilter = {}, now: Date = new Date()): Promise<{ items: MaintenancePlanRow[] }> {
  requireOfficeRole(ctx);
  const tx = await readTx(ctx);
  const query: Record<string, unknown> = { deletedAt: null };
  if (!(filter.includeInactive === true || filter.includeInactive === "true")) query.isActive = true;
  if (filter.assetId !== undefined && filter.assetId !== null && filter.assetId.length > 0) query.assetId = filter.assetId;
  const plans = (await dbTx(tx).db.maintenance_plans.find(query, { sort: { name: 1 }, limit: 500 }).toArray()) as unknown as PlanDoc[];
  const items: MaintenancePlanRow[] = [];
  for (const plan of plans) {
    const rows = await dueRows(tx, plan, now);
    const first = plan.assetId === null || plan.assetId === undefined ? undefined : rows[0];
    items.push({ ...planDto(plan), assetCode: first?.assetCode ?? null, assetName: first?.assetName ?? null, assetCount: rows.length, dueCount: rows.filter((row) => row.isDue).length });
  }
  return { items };
}

// ───────── Scan (worker `maintenance.dueScan`) ─────────

export interface DueScanResult {
  readonly plans: number;
  readonly created: readonly { readonly planId: string; readonly assetId: string; readonly workOrderId: string; readonly number: string }[];
}

const SYSTEM_USER = "system";

/**
 * One organisation's scan, inside the caller's transaction. For every active plan and asset that
 * is due and has no open preventive work order of the plan, creates a PREVENTIVE OPEN work order
 * (source MAINTENANCE, `createdById: null`) and notifies ADMIN and MANAGER (MAINTENANCE_DUE).
 * Running it again creates nothing while that work order is open.
 */
export async function runDueScan(tx: Tx, now: Date = new Date(), options: { readonly timeZone?: string; readonly orgSettings?: unknown } = {}): Promise<DueScanResult> {
  const scoped = dbTx(tx);
  const orgId = scoped.orgId;
  const plans = (await scoped.db.maintenance_plans.find({ deletedAt: null, isActive: true }).toArray()) as unknown as PlanDoc[];
  const created: DueScanResult["created"][number][] = [];
  const settings = slaSettingsOf(options.orgSettings);
  let office: string[] | null = null;
  for (const plan of plans) {
    const rows = await dueRows(tx, plan, now);
    if ((plan.assetId ?? null) !== null) {
      const row = rows[0];
      const nextDueHourMeter = row?.nextDueHourMeter ?? null;
      const nextDueAt = row?.nextDueAt ?? null;
      if ((plan.nextDueHourMeter ?? null) !== nextDueHourMeter || ((plan.nextDueAt ?? null)?.toISOString() ?? null) !== nextDueAt) {
        await scoped.db.maintenance_plans.updateOne(
          { _id: plan._id },
          { $set: { nextDueHourMeter, nextDueAt: nextDueAt === null ? null : new Date(nextDueAt), ...stampUpdate(scoped, now) } },
        );
      }
    }
    for (const row of rows) {
      if (!row.isDue || row.hasOpen) continue;
      const dueAt = await dueAtFor(tx, orgId, row.category, now, "MEDIUM", settings, options.timeZone);
      const workOrder = await workOrderSeams.createFromSource(
        tx,
        { organizationId: orgId, userId: SYSTEM_USER, role: "ADMIN" },
        {
          source: "MAINTENANCE",
          type: "PREVENTIVE",
          maintenancePlanId: plan._id,
          assetId: row.assetId,
          priority: "MEDIUM",
          title: `${plan.name} · ${row.assetCode}`,
          dueAt: dueAt.toISOString(),
          damageIds: [],
          ...(plan.checklistTemplateId === null || plan.checklistTemplateId === undefined ? {} : { checklistTemplateId: plan.checklistTemplateId }),
        },
      );
      created.push({ planId: plan._id, assetId: row.assetId, workOrderId: workOrder.id, number: workOrder.number });
      office ??= await officeRecipients(scoped as unknown as SyncTx, orgId, ["ADMIN", "MANAGER"]);
      if (office.length > 0) {
        await createNotification(scoped as unknown as SyncTx, {
          type: "MAINTENANCE_DUE",
          userIds: office,
          entity: { entityType: "WORK_ORDER", entityId: workOrder.id },
          params: { title: `${row.assetCode} · ${row.assetName}` },
        });
      }
    }
  }
  return { plans: plans.length, created };
}
