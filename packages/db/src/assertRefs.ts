import { AppError } from "@agrorende/contracts/errors";
import type { ClientSession, Db, Filter } from "mongodb";

import { collection } from "./collections";
import type { CollectionDocumentMap, CollectionName, Uuid } from "./types";

export type ReferenceMap = Readonly<Record<string, CollectionName>>;
export type ReferenceValues<TRefs extends ReferenceMap> = {
  readonly [K in keyof TRefs]?: Uuid | readonly Uuid[] | null;
};

export interface AssertRefsContext {
  readonly orgId: Uuid;
}

export interface AssertRefsOptions<TRefs extends ReferenceMap> {
  readonly db: Db;
  readonly ctx: AssertRefsContext;
  readonly refs: TRefs;
  readonly values: ReferenceValues<TRefs>;
  readonly session?: ClientSession;
}

function idsFrom(value: Uuid | readonly Uuid[] | null | undefined): readonly Uuid[] {
  if (value === null || value === undefined) return [];
  return typeof value === "string" ? [value] : value;
}

export async function assertRefs<TRefs extends ReferenceMap>({ db, ctx, refs, values, session }: AssertRefsOptions<TRefs>): Promise<void> {
  for (const [field, collectionName] of Object.entries(refs) as ReadonlyArray<[keyof TRefs & string, CollectionName]>) {
    const ids = idsFrom(values[field]);
    if (ids.length === 0) continue;

    const query = collectionName === "organizations" || collectionName === "sync_counters"
      ? { _id: { $in: ids } }
      : { _id: { $in: ids }, organizationId: ctx.orgId };

    const found = await collection(db, collectionName)
      .countDocuments(query as unknown as Filter<CollectionDocumentMap[typeof collectionName]>, { session });
    if (found !== ids.length) {
      throw new AppError("NOT_FOUND", { details: { field, collection: collectionName } });
    }
  }
}
