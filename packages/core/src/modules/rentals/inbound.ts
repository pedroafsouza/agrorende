import type { Tx } from "@agrorende/contracts/seams";
import type { Rental } from "@agrorende/db";

import { reject } from "../../errors.js";
import { dbTx } from "../assets/kit.js";
import { getSummary } from "../assets/service.js";

export type InboundGap = "supplier" | "partnerAsset" | "site" | "season";

/**
 * Rent-in completeness (RN-12, EC-RN-34). An INBOUND rental needs a supplier customer
 * (`isSupplier`), a partner-owned asset (`ownerType: PARTNER`), a site and a season so its cost
 * lands on the right season and site. OUTBOUND rentals return no gaps.
 */
export async function inboundGaps(tx: Tx, rental: Pick<Rental, "direction" | "assetId" | "customerId" | "siteId" | "seasonId">): Promise<InboundGap[]> {
  if (rental.direction !== "INBOUND") return [];
  const gaps: InboundGap[] = [];
  const customer = await dbTx(tx).db.customers.findOne({ _id: rental.customerId, deletedAt: null }, { projection: { isSupplier: 1 } });
  if (customer?.isSupplier !== true) gaps.push("supplier");
  const asset = await getSummary(tx, rental.assetId);
  if (asset.ownerType !== "PARTNER") gaps.push("partnerAsset");
  if (rental.siteId === null || rental.siteId === undefined) gaps.push("site");
  if (rental.seasonId === null || rental.seasonId === undefined) gaps.push("season");
  return gaps;
}

/** Rejects `INBOUND_RENTAL_INCOMPLETE` (422) with the missing parts; the DRAFT itself stays saved. */
export async function assertInboundComplete(tx: Tx, rental: Pick<Rental, "_id" | "direction" | "assetId" | "customerId" | "siteId" | "seasonId">): Promise<void> {
  const gaps = await inboundGaps(tx, rental);
  if (gaps.length > 0) reject("INBOUND_RENTAL_INCOMPLETE", { rentalId: rental._id, missing: gaps });
}
