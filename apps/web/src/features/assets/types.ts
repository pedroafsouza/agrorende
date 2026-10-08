import type { AssetDTO } from "@agrorende/contracts/dto";
import { AssetCategoryEnum, AssetConditionEnum, AssetOwnerTypeEnum, RateUnitEnum } from "@agrorende/contracts/enums";

export type { AssetDTO };
export const CATEGORIES = AssetCategoryEnum.options;
export const CONDITIONS = AssetConditionEnum.options;
export const OWNER_TYPES = AssetOwnerTypeEnum.options;
export const RATE_UNITS = RateUnitEnum.options;

export interface AssetHistoryEntry {
  readonly id: string;
  readonly action: string;
  readonly actorId: string | null;
  readonly occurredAt: string;
  readonly fromStatus: string | null;
  readonly toStatus: string | null;
}
