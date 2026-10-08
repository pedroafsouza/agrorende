import { getClient, getDb } from "@agrorende/db";
import { maskTaxId } from "@agrorende/contracts";
import {
  PULL_PAGE_LIMIT,
  PullCursorSchema,
  PullRequestSchema,
  TABLE_ORDER,
  type MutationResult,
  type PullCursor,
  type PullResponse,
  type TableName,
} from "@agrorende/contracts/sync";

import type { Ctx } from "../context.js";
import {
  buildScopeFilter,
  commentScope,
  damageScope,
  fieldReportScope,
  fuelLogScope,
  rentalScope,
  stockLocationScope,
  workOrderScope,
  type ScopeContext,
  type ScopeFilter,
  type ScopeIds,
} from "./scopes.js";

type Row = Record<string, unknown>;
type IdRow = { _id: string } & Row;
type Database = Awaited<ReturnType<typeof getDb>>;
type SnapshotSession = ReturnType<Awaited<ReturnType<typeof getClient>>["startSession"]>;

export const TABLE_COLLECTIONS: Record<TableName, string> = {
  organization: "organizations",
  users: "users",
  sites: "sites",
  plots: "plots",
  seasons: "seasons",
  customers: "customers",
  assets: "assets",
  checklistTemplates: "checklist_templates",
  damages: "damages",
  fieldReports: "field_reports",
  workOrders: "work_orders",
  workOrderParts: "work_order_parts",
  rentals: "rentals",
  rentalCharges: "rental_charges",
  inspections: "inspections",
  media: "media",
  activityEvents: "activity_events",
  notifications: "notifications",
  comments: "comments",
  parts: "parts",
  stockLocations: "stock_locations",
  stockLevels: "stock_levels",
  maintenancePlans: "maintenance_plans",
  fuelLogs: "fuel_logs",
};

/** First-sync priority (ARCHITECTURE §7.5): phase 1 user + org, phase 2 jobs and rentals with their context, phase 3 everything. */
export const PHASE_TABLES: Record<PullCursor["phase"], readonly TableName[]> = {
  1: ["organization", "users"],
  2: ["sites", "assets", "checklistTemplates", "workOrders", "rentals"],
  3: TABLE_ORDER,
};

const USER_PRIVATE_FIELDS = ["passwordHash", "hourlyCostCents", "email", "invitedById", "mustChangePassword"] as const;

function wireValue(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map((item) => wireValue(item));
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Row).map(([key, item]) => [key, wireValue(item)]));
  }
  return value;
}

/** Converts a stored document to its wire DTO: `_id` → `id`, dates → ISO strings, `syncVersion` → string. */
export function toWire(doc: Row): Row {
  const { _id, syncVersion, ...rest } = doc;
  const mapped = wireValue(rest) as Row;
  return {
    id: _id,
    ...mapped,
    ...(syncVersion === undefined || syncVersion === null ? {} : { syncVersion: String(syncVersion) }),
  };
}

export interface WireViewer {
  readonly userId: string;
  readonly role: Ctx["role"];
}

/** Applies the per-table field rules of §7.5 (directory-only users, masked tax ids for FIELD). */
export function toTableDto(table: TableName, doc: Row, viewer: WireViewer): Row {
  const row = toWire(doc);
  if (table === "users" && row.id !== viewer.userId) {
    for (const field of USER_PRIVATE_FIELDS) {
      delete row[field];
    }
  }
  if (table === "users" && row.id === viewer.userId) {
    delete row.passwordHash;
  }
  if (table === "customers" && viewer.role === "FIELD") {
    const taxId = typeof row.taxId === "string" ? row.taxId : null;
    delete row.taxId;
    row.taxIdMasked = taxId === null ? null : maskTaxId(taxId);
  }
  if (table === "organization") {
    row.organizationId = row.id;
  }
  return row;
}

function encodeCursor(cursor: PullCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function safeNumber(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") {
    return null;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

export function decodeCursor(token: string | undefined): PullCursor | null {
  if (token === undefined) {
    return { v: 1, phase: 1, snap: 0, after: 0 };
  }
  try {
    const raw = JSON.parse(Buffer.from(token, "base64url").toString("utf8")) as Row;
    const candidate = { ...raw, snap: safeNumber(raw.snap), after: safeNumber(raw.after) };
    const parsed = PullCursorSchema.safeParse(candidate);
    if (!parsed.success || parsed.data.after > parsed.data.snap) {
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

export { encodeCursor };

interface PageResult {
  readonly rows: readonly Row[];
  readonly deletedIds: readonly string[];
  /** Highest version fully covered by this read, or `null` when the table was read up to the snapshot. */
  readonly coveredThrough: number | null;
}

interface PullScope {
  readonly db: Database;
  readonly session: SnapshotSession | undefined;
  readonly ctx: Ctx;
}

async function idsOf(scope: PullScope, collectionName: string, filter: ScopeFilter): Promise<string[]> {
  const docs = await scope.db
    .collection<Row>(collectionName)
    .find(filter as Row, { session: scope.session, projection: { _id: 1 } })
    .toArray();
  return docs.map((doc) => String(doc._id));
}

/** Resolves the parent id sets used by dependent tables (ARCHITECTURE §7.5 scope table). */
export async function resolveScopeIds(scope: PullScope, base: ScopeContext): Promise<ScopeIds> {
  const workOrderDocs = await scope.db
    .collection<Row>("work_orders")
    .find(workOrderScope(base) as Row, { session: scope.session, projection: { _id: 1, fieldReportId: 1 } })
    .toArray();
  const workOrders = workOrderDocs.map((doc) => String(doc._id));
  const workOrderReportIds = workOrderDocs.flatMap((doc) => (typeof doc.fieldReportId === "string" ? [doc.fieldReportId] : []));
  const rentals = await idsOf(scope, "rentals", rentalScope(base));
  const partialIds: ScopeIds = { workOrders, rentals, fieldReports: [], inspections: [], damages: [], comments: [], fuelLogs: [], stockLocations: [] };
  const partial: ScopeContext = { ...base, ids: partialIds };
  const fieldReports = await idsOf(scope, "field_reports", fieldReportScope(partial, workOrderReportIds));
  const inspections = await idsOf(scope, "inspections", { organizationId: base.organizationId, rentalId: { $in: rentals } });
  const damages = await idsOf(scope, "damages", damageScope(partial));
  const comments = await idsOf(scope, "comments", commentScope({ ...base, ids: { ...partialIds, fieldReports } }));
  const fuelLogs = await idsOf(scope, "fuel_logs", fuelLogScope(base));
  const stockLocations = await idsOf(scope, "stock_locations", stockLocationScope(base));
  return { workOrders, rentals, fieldReports, inspections, damages, comments, fuelLogs, stockLocations };
}

async function readTablePage(scope: PullScope, table: TableName, filter: ScopeFilter, after: number, snapshot: number, viewer: WireViewer): Promise<PageResult> {
  const collection = scope.db.collection<IdRow>(TABLE_COLLECTIONS[table]);
  const { organizationId, ...rest } = filter;
  const base: Row = table === "organization" ? { _id: organizationId } : { organizationId, ...rest };
  const query: Row = { ...base, syncVersion: after === 0 ? { $lte: snapshot } : { $gt: after, $lte: snapshot } };
  const docs = await collection
    .find(query, { session: scope.session, sort: { syncVersion: 1, _id: 1 }, limit: PULL_PAGE_LIMIT })
    .toArray();
  let coveredThrough: number | null = null;
  if (docs.length >= PULL_PAGE_LIMIT) {
    const lastVersion = Number(docs[docs.length - 1]?.syncVersion ?? after);
    const seen = new Set(docs.map((doc) => String(doc._id)));
    const sameVersion = await collection
      .find({ ...base, syncVersion: lastVersion }, { session: scope.session, sort: { _id: 1 } })
      .toArray();
    for (const doc of sameVersion) {
      if (!seen.has(String(doc._id))) {
        docs.push(doc);
      }
    }
    coveredThrough = lastVersion;
  }
  const rows: Row[] = [];
  const deletedIds: string[] = [];
  for (const doc of docs) {
    if (doc.deletedAt instanceof Date) {
      deletedIds.push(String(doc._id));
    } else {
      rows.push(toTableDto(table, doc, viewer));
    }
  }
  return { rows, deletedIds, coveredThrough };
}

async function readResolvedMutations(scope: PullScope, after: number, snapshot: number): Promise<MutationResult[]> {
  const docs = await scope.db
    .collection<Row>("processed_mutations")
    .find(
      { organizationId: scope.ctx.organizationId, userId: scope.ctx.userId, resolvedAt: { $ne: null }, syncVersion: { $gt: after, $lte: snapshot } },
      { session: scope.session, sort: { syncVersion: 1 } },
    )
    .toArray();
  return docs.map((doc) => doc.result as MutationResult);
}

function resetResponse(scopeEpoch: number): PullResponse {
  return {
    cursor: encodeCursor({ v: 1, phase: 1, snap: 0, after: 0 }),
    hasMore: false,
    resetRequired: true,
    scopeEpoch,
    changes: {},
    deleted: {},
    resolvedMutations: [],
    serverTime: new Date().toISOString(),
  };
}

/**
 * Loads one row as the caller would pull it, or `null` when it is deleted or outside the
 * caller's pull scope. Used for the `snapshot` of REJECTED push results (ARCHITECTURE §7.3).
 */
export async function loadScopedRow(ctx: Ctx, table: TableName, id: string, now: Date = new Date()): Promise<Row | null> {
  const db = await getDb();
  const scope: PullScope = { db, session: undefined, ctx };
  const base: ScopeContext = { organizationId: ctx.organizationId, userId: ctx.userId, role: ctx.role, now };
  const ids = await resolveScopeIds(scope, base);
  const filter = buildScopeFilter(table, { ...base, ids });
  const { organizationId, ...rest } = filter;
  const query: Row = table === "organization" ? { _id: organizationId } : { $and: [{ organizationId, ...rest }, { _id: id }] };
  const doc = await db.collection<IdRow>(TABLE_COLLECTIONS[table]).findOne(query);
  if (doc === null || (doc.deletedAt !== null && doc.deletedAt !== undefined)) return null;
  return toTableDto(table, doc, { userId: ctx.userId, role: ctx.role });
}

export interface PullOptions {
  readonly now?: Date;
}

/** Scoped, paged pull from a single snapshot (ARCHITECTURE §7.5). */
export async function pull(ctx: Ctx, input: unknown, options: PullOptions = {}): Promise<PullResponse> {
  const request = PullRequestSchema.parse(input);
  const now = options.now ?? new Date();
  const db = await getDb();
  const user = await db.collection<IdRow>("users").findOne({ _id: ctx.userId, organizationId: ctx.organizationId }, { projection: { scopeEpoch: 1 } });
  const scopeEpoch = typeof user?.scopeEpoch === "number" ? user.scopeEpoch : 0;
  const decoded = decodeCursor(request.cursor);
  if (decoded === null || request.scopeEpoch !== scopeEpoch) {
    return resetResponse(scopeEpoch);
  }

  const mongoClient = await getClient();
  const session = mongoClient.startSession({ snapshot: true });
  try {
    const scope: PullScope = { db, session, ctx };
    const counter = await db.collection<IdRow>("sync_counters").findOne({ _id: ctx.organizationId }, { session });
    const horizon = Number(counter?.horizonVersion ?? 0);
    const current = Number(counter?.value ?? 0);
    const steady = decoded.phase === 3 && decoded.after >= decoded.snap && decoded.snap > 0;
    if (decoded.after > 0 && decoded.after < horizon) {
      return resetResponse(scopeEpoch);
    }
    const snapshot = decoded.snap === 0 || steady ? current : decoded.snap;
    const after = decoded.after;

    const base: ScopeContext = { organizationId: ctx.organizationId, userId: ctx.userId, role: ctx.role, now };
    const ids = await resolveScopeIds(scope, base);
    const scopeCtx: ScopeContext = { ...base, ids };
    const viewer: WireViewer = { userId: ctx.userId, role: ctx.role };

    const changes: Partial<Record<TableName, Row[]>> = {};
    const deleted: Partial<Record<TableName, string[]>> = {};
    let nextAfter: number | null = null;
    for (const table of PHASE_TABLES[decoded.phase]) {
      const page = await readTablePage(scope, table, buildScopeFilter(table, scopeCtx), after, snapshot, viewer);
      if (page.rows.length > 0) {
        changes[table] = [...page.rows];
      }
      if (page.deletedIds.length > 0) {
        deleted[table] = [...page.deletedIds];
      }
      if (page.coveredThrough !== null) {
        nextAfter = nextAfter === null ? page.coveredThrough : Math.min(nextAfter, page.coveredThrough);
      }
    }

    const hasMore = nextAfter !== null || decoded.phase < 3;
    let cursor: PullCursor;
    if (nextAfter !== null) {
      cursor = { v: 1, phase: decoded.phase, snap: snapshot, after: nextAfter };
    } else if (decoded.phase < 3) {
      cursor = { v: 1, phase: (decoded.phase + 1) as PullCursor["phase"], snap: snapshot, after: 0 };
    } else {
      cursor = { v: 1, phase: 3, snap: snapshot, after: snapshot };
    }
    const resolvedMutations = await readResolvedMutations(scope, after, snapshot);

    await db.collection<IdRow>("devices").updateOne(
      { installationId: request.deviceId, organizationId: ctx.organizationId, userId: ctx.userId },
      { $set: { lastPullVersion: cursor.after, lastSyncAt: now, lastSeenAt: now, updatedAt: now } },
    );

    return {
      cursor: encodeCursor(cursor),
      hasMore,
      resetRequired: false,
      scopeEpoch,
      changes,
      deleted,
      resolvedMutations,
      serverTime: now.toISOString(),
    };
  } finally {
    await session.endSession();
  }
}
