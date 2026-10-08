import { notImplemented } from "../../errors.js";
import type { Ctx } from "../../context.js";
import type { BillingDTO } from "./dto.js";

export async function listBilling(_ctx: Ctx): Promise<BillingDTO[]> {
  return notImplemented("modules.billing.queries.list");
}
