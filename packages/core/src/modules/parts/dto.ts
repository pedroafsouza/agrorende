import type { PartDTO, StockLevelDTO, StockLocationDTO } from "@agrorende/contracts/dto";
import type { StockLocationType, StockMovementType } from "@agrorende/contracts/enums";

export type { PartDTO, StockLevelDTO, StockLocationDTO };

/** A stock movement as returned by `GET /stock-movements`. */
export interface StockMovementDTO {
  readonly id: string;
  readonly syncVersion: string;
  readonly createdAt: string;
  readonly partId: string;
  readonly type: StockMovementType;
  readonly quantity: number;
  readonly fromLocationId: string | null;
  readonly toLocationId: string | null;
  readonly unitCostCents: number | null;
  readonly workOrderId: string | null;
  readonly workOrderPartId: string | null;
  readonly createdById: string;
  readonly note: string | null;
}

/** A stock level joined with its part and location, for the office stock page and the parts picker. */
export interface StockLevelRow extends StockLevelDTO {
  readonly partSku: string;
  readonly partName: string;
  readonly unit: string;
  readonly unitCostCents: number | null;
  readonly minStock: number | null;
  readonly locationName: string;
  readonly locationType: StockLocationType;
  readonly locationUserId: string | null;
  /** True when `minStock` is set and `quantity ≤ minStock`. */
  readonly isLow: boolean;
}

/** A stock location with the name of the technician who owns it (vans). */
export interface StockLocationRow extends StockLocationDTO {
  readonly userName: string | null;
}
