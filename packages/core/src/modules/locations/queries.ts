import { collections, getDb } from "@agrorende/db";
import type { Db } from "./types";

import type { Ctx } from "../../context";
import type { LocationsDTO } from "./dto";

export interface TrackFilter {
  readonly userId: string;
  readonly from: Date;
  readonly to: Date;
  readonly limit?: number;
}

/** A user's ping track in a time window, oldest first, for the office map trail. */
export async function listLocations(ctx: Pick<Ctx, "orgId">, filter: TrackFilter, db?: Db): Promise<LocationsDTO[]> {
  const rows = await collections
    .locationPings(db ?? (await getDb()))
    .find(
      { organizationId: ctx.orgId, userId: filter.userId, recordedAt: { $gte: filter.from, $lte: filter.to } },
      { sort: { recordedAt: 1 }, limit: Math.min(filter.limit ?? 5_000, 20_000) },
    )
    .toArray();
  return rows.map((row) => ({
    id: row._id,
    organizationId: row.organizationId,
    userId: row.userId,
    recordedAt: row.recordedAt.toISOString(),
    lat: row.lat,
    lng: row.lng,
    accuracyM: row.accuracyM ?? null,
    speedMps: row.speedMps ?? null,
    heading: row.heading ?? null,
    workOrderId: row.workOrderId ?? null,
  }));
}
