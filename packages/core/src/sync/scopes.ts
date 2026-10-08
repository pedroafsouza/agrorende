import type { Role } from "@agrorende/contracts/enums";
import { TABLE_ORDER, type TableName } from "@agrorende/contracts/sync";

export type ScopeFilterValue = string | number | boolean | Date | null | readonly ScopeFilterValue[] | { readonly [key: string]: ScopeFilterValue };
export type ScopeFilter = { readonly [key: string]: ScopeFilterValue };

export interface ScopeContext {
  readonly organizationId: string;
  readonly userId: string;
  readonly role: Role;
  readonly now: Date;
}

export type ScopeBuilder = (ctx: ScopeContext) => ScopeFilter;

const DAYS_30_MS = 30 * 24 * 60 * 60 * 1000;
const DAYS_90_MS = 90 * 24 * 60 * 60 * 1000;

function org(ctx: ScopeContext): ScopeFilter {
  return { organizationId: ctx.organizationId };
}

function since(now: Date, ms: number): Date {
  return new Date(now.getTime() - ms);
}

function wholeOrg(ctx: ScopeContext): ScopeFilter {
  return org(ctx);
}

function workOrders(ctx: ScopeContext): ScopeFilter {
  const base = org(ctx);
  const fieldScope: ScopeFilter[] = [{ assigneeId: ctx.userId }, { previousAssigneeIds: ctx.userId }];
  const officeScope: ScopeFilter = { status: { $in: ["OPEN", "ASSIGNED"] }, updatedAt: { $gte: since(ctx.now, DAYS_30_MS) } };
  return ctx.role === "FIELD" ? { ...base, $or: fieldScope } : { ...base, $or: [...fieldScope, officeScope] };
}

function parentWorkOrder(ctx: ScopeContext): ScopeFilter {
  return { ...org(ctx), parentScope: "workOrders" };
}

function fieldReports(ctx: ScopeContext): ScopeFilter {
  return {
    ...org(ctx),
    $or: [
      { reporterId: ctx.userId, updatedAt: { $gte: since(ctx.now, DAYS_90_MS) } },
      { linkedWorkOrderInScope: true },
      { linkedRentalInScope: true },
    ],
  };
}

function rentals(ctx: ScopeContext): ScopeFilter {
  const shared: ScopeFilter[] = [{ status: { $in: ["RESERVED", "ACTIVE"] } }, { updatedAt: { $gte: since(ctx.now, DAYS_30_MS) } }];
  return ctx.role === "FIELD"
    ? { ...org(ctx), $or: shared }
    : { ...org(ctx), $or: [...shared, { status: "DRAFT" }] };
}

function damages(ctx: ScopeContext): ScopeFilter {
  return { ...org(ctx), $or: [{ repairedAt: null }, { rentalInScope: true }] };
}

function media(ctx: ScopeContext): ScopeFilter {
  return { ...org(ctx), parentInScope: true };
}

function activityEvents(ctx: ScopeContext): ScopeFilter {
  return {
    ...org(ctx),
    $or: [
      { entityType: "WORK_ORDER", workOrderInScope: true },
      { entityType: "FIELD_REPORT", fieldReportInScope: true },
    ],
  };
}

function notifications(ctx: ScopeContext): ScopeFilter {
  return { ...org(ctx), userId: ctx.userId, updatedAt: { $gte: since(ctx.now, DAYS_30_MS) } };
}

function comments(ctx: ScopeContext): ScopeFilter {
  return { ...org(ctx), parentInScope: true };
}

function stockLevels(ctx: ScopeContext): ScopeFilter {
  return { ...org(ctx), $or: [{ vanUserId: ctx.userId }, { locationType: "WAREHOUSE" }] };
}

function fuelLogs(ctx: ScopeContext): ScopeFilter {
  return { ...org(ctx), userId: ctx.userId, updatedAt: { $gte: since(ctx.now, DAYS_90_MS) } };
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
  workOrderParts: parentWorkOrder,
  rentals,
  rentalCharges: rentals,
  inspections: rentals,
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
