import type {
  ClientSession,
  Collection,
  DeleteResult,
  Document,
  FindCursor,
  FindOptions,
  Filter,
  InsertOneResult,
  OptionalUnlessRequiredId,
  UpdateFilter,
  UpdateOptions,
  UpdateResult,
  WithId,
} from "mongodb";
import type { Db } from "mongodb";

import { collection } from "./collections.js";
import type { CollectionDocumentMap, CollectionName, Uuid } from "./types.js";

export interface TenantCtx {
  readonly orgId: Uuid;
}

type TenantCollectionName = {
  [K in CollectionName]: CollectionDocumentMap[K] extends { organizationId: Uuid } ? K : never;
}[CollectionName];

type ScopedFilter<T extends { organizationId: Uuid }> = Omit<Filter<T>, "organizationId"> & {
  readonly organizationId?: never;
};

export class ScopedCollection<T extends { organizationId: Uuid }> {
  readonly #collection: Collection<T>;
  readonly #organizationId: Uuid;
  readonly #session?: ClientSession;

  constructor(collectionRef: Collection<T>, organizationId: Uuid, session?: ClientSession) {
    this.#collection = collectionRef;
    this.#organizationId = organizationId;
    this.#session = session;
  }

  find(filter?: ScopedFilter<T>, options: FindOptions = {}): FindCursor<WithId<T>> {
    return this.#collection.find(this.#withOrg(filter ?? ({} as ScopedFilter<T>)), this.#withSession(options));
  }

  async findOne(filter: ScopedFilter<T>, options: FindOptions = {}): Promise<WithId<T> | null> {
    return this.#collection.findOne(this.#withOrg(filter), this.#withSession(options));
  }

  async insertOne(document: OptionalUnlessRequiredId<T>): Promise<InsertOneResult<T>> {
    return this.#collection.insertOne({ ...document, organizationId: this.#organizationId }, this.#sessionOption());
  }

  async updateOne(filter: ScopedFilter<T>, update: UpdateFilter<T>, options: UpdateOptions = {}): Promise<UpdateResult<T>> {
    return this.#collection.updateOne(this.#withOrg(filter), update, this.#withSession(options));
  }

  async updateMany(filter: ScopedFilter<T>, update: UpdateFilter<T>, options: UpdateOptions = {}): Promise<UpdateResult<T>> {
    return this.#collection.updateMany(this.#withOrg(filter), update, this.#withSession(options));
  }

  async softDeleteOne(filter: ScopedFilter<T>, deletedAt: Date, syncVersion?: number): Promise<UpdateResult<T>> {
    const update = syncVersion === undefined ? { $set: { deletedAt } } : { $set: { deletedAt, syncVersion } };
    return this.#collection.updateOne(this.#withOrg(filter), update as unknown as UpdateFilter<T>, this.#sessionOption());
  }

  async deleteManyForTestOnly(filter?: ScopedFilter<T>): Promise<DeleteResult> {
    return this.#collection.deleteMany(this.#withOrg(filter ?? ({} as ScopedFilter<T>)), this.#sessionOption());
  }


  #withOrg(filter: ScopedFilter<T>): Filter<T> {
    return { ...filter, organizationId: this.#organizationId } as Filter<T>;
  }

  #sessionOption(): { session?: ClientSession } {
    return this.#session === undefined ? {} : { session: this.#session };
  }

  #withSession<TOptions extends Document>(options: TOptions): TOptions & { session?: ClientSession } {
    return this.#session === undefined ? options : { ...options, session: this.#session };
  }
}

export type ScopedDb = {
  readonly [K in TenantCollectionName]: ScopedCollection<CollectionDocumentMap[K] & { organizationId: Uuid }>;
};

const TENANT_COLLECTIONS = [
  "number_sequences",
  "users",
  "refresh_tokens",
  "user_identities",
  "auth_links",
  "org_usage",
  "devices",
  "device_diagnostics",
  "sites",
  "plots",
  "seasons",
  "customers",
  "assets",
  "field_reports",
  "work_orders",
  "work_order_parts",
  "comments",
  "rentals",
  "rental_charges",
  "inspections",
  "damages",
  "checklist_templates",
  "media",
  "location_pings",
  "activity_events",
  "notifications",
  "export_jobs",
  "event_outbox",
  "processed_mutations",
  "maintenance_plans",
  "fuel_logs",
  "parts",
  "stock_locations",
  "stock_levels",
  "stock_movements",
  "billing_documents",
] as const satisfies readonly TenantCollectionName[];

export function scoped(ctx: TenantCtx, db: Db, session?: ClientSession): ScopedDb {
  const entries = TENANT_COLLECTIONS.map((name) => [
    name,
    new ScopedCollection(collection(db, name), ctx.orgId, session),
  ] as const);
  return Object.fromEntries(entries) as ScopedDb;
}

export function platform(db: Db): {
  readonly organizations: Collection<CollectionDocumentMap["organizations"]>;
  readonly syncCounters: Collection<CollectionDocumentMap["sync_counters"]>;
  readonly platformAuditEvents: Collection<CollectionDocumentMap["platform_audit_events"]>;
} {
  return {
    organizations: collection(db, "organizations"),
    syncCounters: collection(db, "sync_counters"),
    platformAuditEvents: collection(db, "platform_audit_events"),
  };
}
