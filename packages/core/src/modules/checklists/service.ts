import type { AssetCategory, ChecklistKind } from "@agrorende/contracts/enums";
import type { Tx } from "@agrorende/contracts/seams";
import type { ChecklistTemplate } from "@agrorende/db";

import type { Ctx } from "../../context.js";
import { reject } from "../../errors.js";
import { OPEN_STATUSES, REPAIR_STATUSES } from "../assets/service.js";
import { assertVersion, dbTx, newId, stampCreate, stampUpdate, toDto, writeActivity, parseInput } from "../assets/kit.js";
import {
  TemplateCreateInputSchema,
  TemplatePublishInputSchema,
  TemplateUpdateInputSchema,
  type ChecklistSnapshot,
  type ChecklistTemplateDTO,
  type TemplateCreateInput,
  type TemplatePublishInput,
  type TemplateUpdateInput,
} from "./dto.js";

export function toTemplateDto(doc: ChecklistTemplate): ChecklistTemplateDTO {
  return toDto<ChecklistTemplateDTO>(doc);
}

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

async function loadTemplate(tx: Tx, templateId: string): Promise<ChecklistTemplate> {
  const doc = await dbTx(tx).db.checklist_templates.findOne({ _id: templateId, deletedAt: null });
  if (doc === null) return reject("NOT_FOUND", { entityType: "CHECKLIST_TEMPLATE", entityId: templateId });
  return doc;
}

/**
 * Seam `checklists.snapshotPublished` (DELIVERY-PLAN §4). Returns a frozen deep copy of the
 * current published version; callers store it on the WO or inspection so later publishes
 * never change running work.
 */
export async function snapshotPublished(tx: Tx, templateId: string): Promise<ChecklistSnapshot> {
  const doc = await loadTemplate(tx, templateId);
  const dto = toTemplateDto(doc);
  return deepFreeze(structuredClone(dto));
}

/** Seam `checklists.defaultTemplateId`: newest active template for the kind and category. */
export async function defaultTemplateId(tx: Tx, orgId: string, kind: ChecklistKind, category: AssetCategory): Promise<string | null> {
  const scopedTx = dbTx(tx);
  if (scopedTx.orgId !== orgId) reject("FORBIDDEN", { orgId });
  const candidates = await scopedTx.db.checklist_templates
    .find({ deletedAt: null, archivedAt: null, isActive: true, appliesTo: kind })
    .sort({ updatedAt: -1, _id: -1 })
    .toArray();
  const specific = candidates.find((doc) => doc.assetCategories.includes(category));
  if (specific !== undefined) return specific._id;
  return candidates.find((doc) => doc.assetCategories.length === 0)?._id ?? null;
}

export async function createTemplate(tx: Tx, ctx: Ctx, raw: TemplateCreateInput): Promise<ChecklistTemplateDTO> {
  const input = parseInput(TemplateCreateInputSchema, raw);
  const scopedTx = dbTx(tx);
  const now = new Date();
  const doc: ChecklistTemplate = {
    _id: newId(now.getTime()),
    organizationId: scopedTx.orgId,
    ...stampCreate(scopedTx, now),
    deletedAt: null,
    name: input.name,
    appliesTo: input.appliesTo,
    assetCategories: input.assetCategories,
    templateVersion: 1,
    items: input.items,
    accessories: input.accessories,
    isActive: input.isActive,
    archivedAt: null,
  };
  await scopedTx.db.checklist_templates.insertOne(doc);
  await writeActivity(scopedTx, { entityType: "CHECKLIST_TEMPLATE", entityId: doc._id, action: "template.published", actorId: ctx.userId, meta: { templateVersion: 1 } });
  return toTemplateDto(doc);
}

export async function updateTemplate(tx: Tx, ctx: Ctx, templateId: string, raw: TemplateUpdateInput, ifMatch?: string | null): Promise<ChecklistTemplateDTO> {
  const input = parseInput(TemplateUpdateInputSchema, raw);
  const scopedTx = dbTx(tx);
  const template = await loadTemplate(tx, templateId);
  assertVersion(template, ifMatch);
  const { archived, ...fields } = input;
  const set: Record<string, unknown> = { ...fields, ...stampUpdate(scopedTx) };
  if (archived !== undefined) {
    set.archivedAt = archived ? new Date() : null;
    if (archived) set.isActive = false;
  }
  await scopedTx.db.checklist_templates.updateOne({ _id: templateId }, { $set: set });
  if (archived !== undefined) {
    await writeActivity(scopedTx, { entityType: "CHECKLIST_TEMPLATE", entityId: templateId, action: archived ? "template.archived" : "template.restored", actorId: ctx.userId });
  }
  return toTemplateDto(await loadTemplate(tx, templateId));
}

/** Work still running on an older snapshot of this template (EC-OPS-13). */
export async function inUseCount(tx: Tx, templateId: string): Promise<number> {
  const rows = await dbTx(tx)
    .db.work_orders.find(
      { checklistTemplateId: templateId, deletedAt: null, status: { $in: [...OPEN_STATUSES, ...REPAIR_STATUSES] } },
      { projection: { _id: 1 } },
    )
    .toArray();
  return rows.length;
}

/**
 * Publishes new items and bumps `templateVersion`. When running work uses the template the
 * first call returns TEMPLATE_VERSION_IN_USE with the count; `confirmInUse` publishes anyway
 * and running work keeps its stored snapshot.
 */
export async function publishTemplate(tx: Tx, ctx: Ctx, templateId: string, raw: TemplatePublishInput, ifMatch?: string | null): Promise<ChecklistTemplateDTO> {
  const input = parseInput(TemplatePublishInputSchema, raw);
  const scopedTx = dbTx(tx);
  const template = await loadTemplate(tx, templateId);
  assertVersion(template, ifMatch);
  const inUse = await inUseCount(tx, templateId);
  if (inUse > 0 && !input.confirmInUse) {
    reject("TEMPLATE_VERSION_IN_USE", { inUse, templateVersion: template.templateVersion });
  }
  const templateVersion = template.templateVersion + 1;
  await scopedTx.db.checklist_templates.updateOne(
    { _id: templateId },
    { $set: { items: input.items, accessories: input.accessories ?? template.accessories, templateVersion, ...stampUpdate(scopedTx) } },
  );
  await writeActivity(scopedTx, {
    entityType: "CHECKLIST_TEMPLATE",
    entityId: templateId,
    action: "template.published",
    actorId: ctx.userId,
    meta: { templateVersion, previousVersion: template.templateVersion, inUse },
  });
  return toTemplateDto(await loadTemplate(tx, templateId));
}

/** EC-OPS-12: templates referenced by work, inspections or plans are archived instead. */
export async function deleteTemplate(tx: Tx, ctx: Ctx, templateId: string): Promise<void> {
  const scopedTx = dbTx(tx);
  await loadTemplate(tx, templateId);
  const db = scopedTx.db;
  const refs = await Promise.all([
    db.work_orders.findOne({ checklistTemplateId: templateId }, { projection: { _id: 1 } }),
    db.inspections.findOne({ templateId }, { projection: { _id: 1 } }),
    db.maintenance_plans.findOne({ checklistTemplateId: templateId }, { projection: { _id: 1 } }),
  ]);
  if (refs.some((ref) => ref !== null)) reject("RECORD_IN_USE", { entityType: "CHECKLIST_TEMPLATE", entityId: templateId });
  await db.checklist_templates.softDeleteOne({ _id: templateId }, new Date(), scopedTx.syncVersion);
  await writeActivity(scopedTx, { entityType: "CHECKLIST_TEMPLATE", entityId: templateId, action: "template.deleted", actorId: ctx.userId });
}
