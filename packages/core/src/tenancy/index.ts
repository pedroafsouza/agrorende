import type { Ctx } from "../context.js";
import { notImplemented } from "../errors.js";

export async function assertOrganizationWritable(_ctx: Ctx): Promise<void> {
  return notImplemented("tenancy.assertOrganizationWritable");
}
