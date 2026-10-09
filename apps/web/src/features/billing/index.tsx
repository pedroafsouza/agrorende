import type { EntityType } from "@agrorende/contracts/enums";
import type { ReactElement } from "react";

export interface BillingActionsProps {
  readonly entityType: Extract<EntityType, "WORK_ORDER" | "RENTAL">;
  readonly entityId: string;
}

/** Mount point for the billing actions (P1 billing documents). The wave 6 owner fills it in; until then it renders nothing. */
export function BillingActions(_props: BillingActionsProps): ReactElement | null {
  return null;
}
