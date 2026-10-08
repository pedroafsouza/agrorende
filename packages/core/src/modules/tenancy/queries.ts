import { AppError } from "@agrorende/contracts/errors";
import { collections, getDb } from "@agrorende/db";

import type { Ctx } from "../../context.js";
import type { TenancyDTO } from "./dto.js";
import { orgStatusDto } from "./lifecycle.js";
import { readUsage } from "./usage.js";

/** Tenant view of the tenancy list: only the caller's own organisation, never other tenants. */
export async function listTenancy(ctx: Ctx): Promise<TenancyDTO[]> {
  const db = await getDb();
  const org = await collections.organizations(db).findOne({ _id: ctx.organizationId });
  if (org === null) throw new AppError("NOT_FOUND", { details: { entityType: "ORGANIZATION" } });
  const [latest] = await readUsage(ctx.organizationId, 1, db);
  return [
    {
      id: org._id,
      name: org.name,
      ...orgStatusDto(org),
      signupSource: org.signupSource ?? null,
      expectedFieldUsers: org.expectedFieldUsers ?? null,
      createdAt: org.createdAt.toISOString(),
      latestUsage: latest ?? null,
    },
  ];
}
