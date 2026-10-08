import type { SeasonCloseInput, SeasonUpdateInput } from "@/lib/core.types";
import { ADMIN_ONLY, ifMatch, param, readJson, route, seasonsCore, write } from "@/lib/core.server";

/** `{ "close": true, "confirmOpenWork"?: boolean }` closes the season (EC-ERP-05); other bodies edit it. */
export const PATCH = route(ADMIN_ONLY, async (request, ctx, params) => {
  const body = (await readJson(request)) as (SeasonUpdateInput & { close?: undefined }) | (SeasonCloseInput & { close: true });
  const id = param(params, "id");
  if (body.close === true) {
    const { close: _close, ...rest } = body;
    return write(ctx, (tx) => seasonsCore.closeSeason(tx, ctx, id, rest));
  }
  return write(ctx, (tx) => seasonsCore.updateSeason(tx, ctx, id, body, ifMatch(request)));
});
