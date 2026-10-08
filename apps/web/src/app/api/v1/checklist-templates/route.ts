import { ChecklistKindEnum } from "@agrorende/contracts/enums";

import type { TemplateCreateInput } from "@/lib/core.types";
import { checklistsCore, checklistsQueries, OFFICE, query, readJson, route, write } from "@/lib/core.server";

export const GET = route(OFFICE, (request, ctx) => {
  const q = query(request);
  const kind = ChecklistKindEnum.safeParse(q.kind);
  return checklistsQueries.listTemplates(ctx, { ...(kind.success ? { kind: kind.data } : {}), includeArchived: q.includeArchived === "true" });
});

export const POST = route(OFFICE, async (request, ctx) => {
  const body = (await readJson(request)) as TemplateCreateInput;
  return write(ctx, (tx) => checklistsCore.createTemplate(tx, ctx, body));
});
