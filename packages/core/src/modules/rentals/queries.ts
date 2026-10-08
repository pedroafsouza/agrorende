import { notImplemented } from "../../errors.js";
import type { Ctx } from "../../context.js";
import type { RentalsDTO } from "./dto.js";

export async function listRentals(_ctx: Ctx): Promise<RentalsDTO[]> {
  return notImplemented("modules.rentals.queries.list");
}
