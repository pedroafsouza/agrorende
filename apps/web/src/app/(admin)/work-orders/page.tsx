import { WorkOrdersIntl } from "@/features/work-orders/WorkOrdersIntl";
import { WorkOrdersListPage } from "@/features/work-orders/WorkOrdersListPage";

export default function WorkOrdersPage() {
  return (
    <WorkOrdersIntl>
      <WorkOrdersListPage />
    </WorkOrdersIntl>
  );
}
