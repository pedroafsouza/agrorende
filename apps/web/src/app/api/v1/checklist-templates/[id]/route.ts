import type { TemplateUpdateInput } from "@/lib/core.types";
import { checklistsCore, checklistsQueries, ifMatch, OFFICE, param, readJson, route, write } from "@/lib/core.server";

export const GET = route(OFFICE, async (_request, ctx, params) => {
  const id = param(params, "id");
  const template = await checklistsQueries.getTemplate(ctx, id);
  const inUse = await write(ctx, (tx) => checklistsCore.inUseCount(tx, id));
  return { ...template, inUse };
});

export const PATCH = route(OFFICE, async (request, ctx, params) => {
  const body = (await readJson(request)) as TemplateUpdateInput;
  return write(ctx, (tx) => checklistsCore.updateTemplate(tx, ctx, param(params, "id"), body, ifMatch(request)));
});

export const DELETE = route(OFFICE, (_request, ctx, params) => write(ctx, (tx) => checklistsCore.deleteTemplate(tx, ctx, param(params, "id"))));
