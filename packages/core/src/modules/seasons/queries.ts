import type { Season } from "@agrorende/db";

import type { Ctx } from "../../context";
import { reject } from "../../errors";
import { readDb, type Page } from "../assets/kit";
import type { SeasonDTO } from "./dto";
import { toSeasonDto } from "./service";

export async function listSeasons(ctx: Pick<Ctx, "orgId">): Promise<Page<SeasonDTO>> {
  const db = await readDb(ctx);
  const docs: Season[] = await db.seasons.find({ deletedAt: null }).sort({ startsOn: -1, _id: 1 }).toArray();
  return { items: docs.map(toSeasonDto), nextCursor: null };
}

export async function getSeason(ctx: Pick<Ctx, "orgId">, seasonId: string): Promise<SeasonDTO> {
  const db = await readDb(ctx);
  const doc = await db.seasons.findOne({ _id: seasonId, deletedAt: null });
  if (doc === null) return reject("NOT_FOUND", { entityType: "SEASON", entityId: seasonId });
  return toSeasonDto(doc);
}
