import type { Role } from "@agrorende/contracts/enums";
import { TABLE_ORDER, type TableName } from "@agrorende/contracts/sync";

export type ScopeFilterValue = string | number | boolean | Date | null | readonly ScopeFilterValue[] | { readonly [key: string]: ScopeFilterValue };
export type ScopeFilter = { readonly [key: string]: ScopeFilterValue };

/**
 * Ids of the parent entities that are inside the caller's scope. `pull` resolves them once per
 * request (inside the snapshot session) so that child tables can be filtered with `$in`.
 * Without ids every dependent table resolves to an empty set, which is the safe default.
 */
export interface ScopeIds {
  readonly workOrders: readonly string[];
  readonly fieldReports: readonly string[];
  readonly rentals: readonly string[];
  readonly inspections: readonly string[];
  readonly damages: readonly string[];
  readonly comments: readonly string[];
  readonly fuelLogs: readonly string[];
  readonly stockLocations: readonly string[];
}

export const EMPTY_SCOPE_IDS: ScopeIds = {
  workOrders: [],
  fieldReports: [],
  rentals: [],
  inspections: [],
  damages: [],
  comments: [],
  fuelLogs: [],
  stockLocations: [],
};

export interface ScopeContext {
  readonly organizationId: string;
  readonly userId: string;
  readonly role: Role;
  readonly now: Date;
  readonly ids?: ScopeIds;
}

export type ScopeBuilder = (ctx: ScopeContext) => ScopeFilter;

const DAY_MS = 24 * 60 * 60 * 1000;
export const SCOPE_WINDOW_30_DAYS_MS = 30 * DAY_MS;
export const SCOPE_WINDOW_90_DAYS_MS = 90 * DAY_MS;

function org(ctx: ScopeContext): ScopeFilter {
  return { organizationId: ctx.organizationId };
}

function since(now: Date, ms: number): Date {
  return new Date(now.getTime() - ms);
}

function ids(ctx: ScopeContext): ScopeIds {
  return ctx.ids ?? EMPTY_SCOPE_IDS;
}

function isOffice(role: Role): boolean {
  return role === "ADMIN" || role === "MANAGER";
}

function wholeOrg(ctx: ScopeContext): ScopeFilter {
  return org(ctx);
}

/** Work orders the user is (or was) assigned to; office roles on mobile also get recent open work. */
export function workOrderScope(ctx: ScopeContext): ScopeFilter {
  const mine: ScopeFilter[] = [{ assigneeId: ctx.userId }, { previousAssigneeIds: ctx.userId }];
  if (!isOffice(ctx.role)) {
    return { ...org(ctx), $or: mine };
  }
  const recentOpen: ScopeFilter = { status: { $in: ["OPEN", "ASSIGNED"] }, createdAt: { $gte: since(ctx.now, SCOPE_WINDOW_30_DAYS_MS) } };
  return { ...org(ctx), $or: [...mine, recentOpen] };
}

/** Rentals: RESERVED or ACTIVE, or updated in the last 30 days; DRAFT only for office roles. */
export function rentalScope(ctx: ScopeContext): ScopeFilter {
  const live: ScopeFilter = { status: { $in: ["RESERVED", "ACTIVE"] } };
  const recent: ScopeFilter = { updatedAt: { $gte: since(ctx.now, SCOPE_WINDOW_30_DAYS_MS) } };
  if (isOffice(ctx.role)) {
    return { ...org(ctx), $or: [live, recent, { status: "DRAFT" }] };
  }
  return { ...org(ctx), status: { $ne: "DRAFT" }, $or: [live, recent] };
}

/** Field reports: mine in the last 90 days, or linked to a work order or rental in scope. */
export function fieldReportScope(ctx: ScopeContext, workOrderReportIds: readonly string[] = []): ScopeFilter {
  const scope = ids(ctx);
  return {
    ...org(ctx),
    $or: [
      { reporterId: ctx.userId, updatedAt: { $gte: since(ctx.now, SCOPE_WINDOW_90_DAYS_MS) } },
      { workOrderId: { $in: scope.workOrders } },
      { rentalId: { $in: scope.rentals } },
      { _id: { $in: [...workOrderReportIds, ...scope.fieldReports] } },
    ],
  };
}

function workOrders(ctx: ScopeContext): ScopeFilter {
  return ctx.ids === undefined ? workOrderScope(ctx) : { ...org(ctx), _id: { $in: ids(ctx).workOrders } };
}

function rentals(ctx: ScopeContext): ScopeFilter {
  return ctx.ids === undefined ? rentalScope(ctx) : { ...org(ctx), _id: { $in: ids(ctx).rentals } };
}

function fieldReports(ctx: ScopeContext): ScopeFilter {
  return ctx.ids === undefined ? fieldReportScope(ctx) : { ...org(ctx), _id: { $in: ids(ctx).fieldReports } };
}

function workOrderParts(ctx: ScopeContext): ScopeFilter {
  return { ...org(ctx), workOrderId: { $in: ids(ctx).workOrders } };
}

function rentalChildren(ctx: ScopeContext): ScopeFilter {
  return { ...org(ctx), rentalId: { $in: ids(ctx).rentals } };
}

/** Unrepaired damages for the whole org, plus damages linked to rentals in scope. */
export function damageScope(ctx: ScopeContext): ScopeFilter {
  return { ...org(ctx), $or: [{ repairedAt: null }, { detectedRentalId: { $in: ids(ctx).rentals } }] };
}

function damages(ctx: ScopeContext): ScopeFilter {
  return ctx.ids === undefined ? damageScope(ctx) : { ...org(ctx), _id: { $in: ids(ctx).damages } };
}

function media(ctx: ScopeContext): ScopeFilter {
  const scope = ids(ctx);
  return {
    ...org(ctx),
    $or: [
      { "parent.type": "ASSET" },
      { "parent.type": "FIELD_REPORT", "parent.id": { $in: scope.fieldReports } },
      { "parent.type": "WORK_ORDER", "parent.id": { $in: scope.workOrders } },
      { "parent.type": "INSPECTION", "parent.id": { $in: scope.inspections } },
      { "parent.type": "COMMENT", "parent.id": { $in: scope.comments } },
      { "parent.type": "FUEL_LOG", "parent.id": { $in: scope.fuelLogs } },
      { damageId: { $in: scope.damages } },
    ],
  };
}

function activityEvents(ctx: ScopeContext): ScopeFilter {
  const scope = ids(ctx);
  return {
    ...org(ctx),
    $or: [
      { entityType: "WORK_ORDER", entityId: { $in: scope.workOrders } },
      { entityType: "FIELD_REPORT", entityId: { $in: scope.fieldReports } },
    ],
  };
}

function notifications(ctx: ScopeContext): ScopeFilter {
  return { ...org(ctx), userId: ctx.userId, createdAt: { $gte: since(ctx.now, SCOPE_WINDOW_30_DAYS_MS) } };
}

/** Comments whose parent is in scope; assets are org-wide. */
export function commentScope(ctx: ScopeContext): ScopeFilter {
  const scope = ids(ctx);
  return {
    ...org(ctx),
    $or: [
      { entityType: "ASSET" },
      { entityType: "WORK_ORDER", entityId: { $in: scope.workOrders } },
      { entityType: "FIELD_REPORT", entityId: { $in: scope.fieldReports } },
      { entityType: "RENTAL", entityId: { $in: scope.rentals } },
    ],
  };
}

function comments(ctx: ScopeContext): ScopeFilter {
  return ctx.ids === undefined ? commentScope(ctx) : { ...org(ctx), _id: { $in: ids(ctx).comments } };
}

export function stockLocationScope(ctx: ScopeContext): ScopeFilter {
  return { ...org(ctx), $or: [{ userId: ctx.userId }, { type: "WAREHOUSE" }] };
}

function stockLevels(ctx: ScopeContext): ScopeFilter {
  return { ...org(ctx), stockLocationId: { $in: ids(ctx).stockLocations } };
}

/** Fuel logs: own, last 90 days. */
export function fuelLogScope(ctx: ScopeContext): ScopeFilter {
  return { ...org(ctx), operatorId: ctx.userId, filledAt: { $gte: since(ctx.now, SCOPE_WINDOW_90_DAYS_MS) } };
}

function fuelLogs(ctx: ScopeContext): ScopeFilter {
  return ctx.ids === undefined ? fuelLogScope(ctx) : { ...org(ctx), _id: { $in: ids(ctx).fuelLogs } };
}

const byTable: Record<TableName, ScopeBuilder> = {
  organization: wholeOrg,
  users: wholeOrg,
  sites: wholeOrg,
  plots: wholeOrg,
  seasons: wholeOrg,
  customers: wholeOrg,
  assets: wholeOrg,
  checklistTemplates: wholeOrg,
  damages,
  fieldReports,
  workOrders,
  workOrderParts,
  rentals,
  rentalCharges: rentalChildren,
  inspections: rentalChildren,
  media,
  activityEvents,
  notifications,
  comments,
  parts: wholeOrg,
  stockLocations: wholeOrg,
  stockLevels,
  maintenancePlans: wholeOrg,
  fuelLogs,
};

export const scopeBuilders = Object.fromEntries(
  TABLE_ORDER.map((table) => [
    table,
    {
      ADMIN: byTable[table],
      MANAGER: byTable[table],
      FIELD: byTable[table],
    } satisfies Record<Role, ScopeBuilder>,
  ]),
) as Record<TableName, Record<Role, ScopeBuilder>>;

export function buildScopeFilter(table: TableName, ctx: ScopeContext): ScopeFilter {
  return scopeBuilders[table][ctx.role](ctx);
}
