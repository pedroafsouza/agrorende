import type { TemplatePublishInput } from "@/lib/core.types";
import { checklistsCore, ifMatch, OFFICE, param, readJson, route, write } from "@/lib/core.server";

export const POST = route(OFFICE, async (request, ctx, params) => {
  const body = (await readJson(request)) as TemplatePublishInput;
  return write(ctx, (tx) => checklistsCore.publishTemplate(tx, ctx, param(params, "id"), body, ifMatch(request)));
});
