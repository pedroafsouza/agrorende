import { collections } from "@agrorende/db";

import type { Ctx } from "../../context";
import { escapeRegex } from "../assets/kit";
import { opsDb, type OpsDeps } from "./queries";

/**
 * Global search behind the ⌘K command palette (ARCHITECTURE §8 `GET /search?q=`): the top five
 * matches per type. Every filter starts with `organizationId` so the org-prefixed indexes apply.
 */
export const SEARCH_TYPES = ["assets", "fieldReports", "workOrders", "rentals", "customers", "sites"] as const;
export type SearchType = (typeof SEARCH_TYPES)[number];

export interface SearchHitDTO {
  readonly id: string;
  readonly type: SearchType;
  readonly title: string;
  readonly subtitle: string | null;
  readonly href: string;
}

export type SearchResultsDTO = { readonly q: string; readonly tookMs: number } & { readonly [K in SearchType]: readonly SearchHitDTO[] };

export const SEARCH_LIMIT = 5;
export const SEARCH_MIN_LENGTH = 2;
const SEARCH_MAX_LENGTH = 80;

function empty(q: string): SearchResultsDTO {
  return { q, tookMs: 0, assets: [], fieldReports: [], workOrders: [], rentals: [], customers: [], sites: [] };
}

function joined(...parts: readonly (string | null | undefined)[]): string | null {
  const text = parts.filter((part): part is string => typeof part === "string" && part !== "").join(" · ");
  return text === "" ? null : text;
}

export async function search(ctx: Pick<Ctx, "orgId">, rawQuery: string | null | undefined, deps: OpsDeps = {}): Promise<SearchResultsDTO> {
  const q = (rawQuery ?? "").trim().slice(0, SEARCH_MAX_LENGTH);
  if (q.length < SEARCH_MIN_LENGTH) return empty(q);
  const started = performance.now();
  const db = await opsDb(deps);
  const orgId = ctx.orgId;
  const pattern = new RegExp(escapeRegex(q), "iu");
  const digits = q.replace(/\D/gu, "");
  const live = { organizationId: orgId, deletedAt: null };
  const options = { limit: SEARCH_LIMIT, sort: { updatedAt: -1 as const } };
  const [assets, fieldReports, workOrders, rentals, customers, sites] = await Promise.all([
    collections
      .assets(db)
      .find({ ...live, $or: [{ code: pattern }, { name: pattern }, { plate: pattern }, { serialNumber: pattern }] }, { ...options, projection: { code: 1, name: 1, plate: 1, make: 1, model: 1 } })
      .toArray(),
    collections
      .fieldReports(db)
      .find({ ...live, $or: [{ number: pattern }, { title: pattern }] }, { ...options, projection: { number: 1, title: 1, status: 1 } })
      .toArray(),
    collections
      .workOrders(db)
      .find({ ...live, $or: [{ number: pattern }, { title: pattern }] }, { ...options, projection: { number: 1, title: 1, status: 1 } })
      .toArray(),
    collections
      .rentals(db)
      .find({ ...live, number: pattern }, { ...options, projection: { number: 1, status: 1, direction: 1 } })
      .toArray(),
    collections
      .customers(db)
      .find(
        { ...live, $or: [{ name: pattern }, { tradeName: pattern }, { taxId: pattern }, ...(digits.length >= 3 ? [{ taxId: new RegExp(escapeRegex(digits), "u") }] : [])] },
        { ...options, projection: { name: 1, tradeName: 1, taxId: 1, city: 1 } },
      )
      .toArray(),
    collections
      .sites(db)
      .find({ ...live, $or: [{ name: pattern }, { city: pattern }] }, { ...options, projection: { name: 1, city: 1, state: 1 } })
      .toArray(),
  ]);
  return {
    q,
    tookMs: Math.round(performance.now() - started),
    assets: assets.map((a) => ({ id: a._id, type: "assets", title: `${a.code} · ${a.name}`, subtitle: joined(a.plate, a.make, a.model), href: `/assets/${a._id}` })),
    fieldReports: fieldReports.map((r) => ({ id: r._id, type: "fieldReports", title: joined(r.number, r.title) ?? r.title, subtitle: r.status, href: `/reports/${r._id}` })),
    workOrders: workOrders.map((w) => ({ id: w._id, type: "workOrders", title: `${w.number} · ${w.title}`, subtitle: w.status, href: `/work-orders/${w._id}` })),
    rentals: rentals.map((r) => ({ id: r._id, type: "rentals", title: r.number, subtitle: joined(r.direction, r.status), href: `/rentals/${r._id}` })),
    customers: customers.map((c) => ({ id: c._id, type: "customers", title: c.name, subtitle: joined(c.tradeName, c.taxId, c.city), href: `/customers/${c._id}` })),
    sites: sites.map((s) => ({ id: s._id, type: "sites", title: s.name, subtitle: joined(s.city, s.state), href: `/sites/${s._id}` })),
  };
}
