import type { ChecklistTemplate } from "@agrorende/db";
import type { ChecklistKind } from "@agrorende/contracts/enums";

import type { Ctx } from "../../context.js";
import { reject } from "../../errors.js";
import { readDb, type Page } from "../assets/kit.js";
import type { ChecklistTemplateDTO } from "./dto.js";
import { toTemplateDto } from "./service.js";

export async function listTemplates(
  ctx: Pick<Ctx, "orgId">,
  opts: { kind?: ChecklistKind; includeArchived?: boolean } = {},
): Promise<Page<ChecklistTemplateDTO>> {
  const db = await readDb(ctx);
  const filter: Record<string, unknown> = { deletedAt: null };
  if (opts.includeArchived !== true) filter.archivedAt = null;
  if (opts.kind !== undefined) filter.appliesTo = opts.kind;
  const docs: ChecklistTemplate[] = await db.checklist_templates.find(filter).sort({ name: 1, _id: 1 }).toArray();
  return { items: docs.map(toTemplateDto), nextCursor: null };
}

export async function getTemplate(ctx: Pick<Ctx, "orgId">, templateId: string): Promise<ChecklistTemplateDTO> {
  const db = await readDb(ctx);
  const doc = await db.checklist_templates.findOne({ _id: templateId, deletedAt: null });
  if (doc === null) return reject("NOT_FOUND", { entityType: "CHECKLIST_TEMPLATE", entityId: templateId });
  return toTemplateDto(doc);
}
