import { NewWorkOrderPage } from "@/features/work-orders/NewWorkOrderPage";
import { WorkOrdersIntl } from "@/features/work-orders/WorkOrdersIntl";

export default function NewWorkOrderRoute() {
  return (
    <WorkOrdersIntl>
      <NewWorkOrderPage />
    </WorkOrdersIntl>
  );
}
