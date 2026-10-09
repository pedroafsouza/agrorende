import type { ReactElement } from "react";

import type { WorkOrderListItem } from "../types";

export interface ExternalCostPanelProps {
  readonly workOrder: Pick<WorkOrderListItem, "id" | "status" | "syncVersion" | "externalCostCents" | "externalCostNote">;
}

/**
 * Mount point for the external-cost panel (P1 ERP-03). T14 fills it in wave 6; until then it renders nothing,
 * and the office edits the value through the `externalCost` action dialog.
 */
export function ExternalCostPanel(_props: ExternalCostPanelProps): ReactElement | null {
  return null;
}
