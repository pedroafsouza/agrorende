import { notImplemented } from "../../errors.js";
import type { Ctx } from "../../context.js";
import type { CustomersDTO } from "./dto.js";

export async function listCustomers(_ctx: Ctx): Promise<CustomersDTO[]> {
  return notImplemented("modules.customers.queries.list");
}
