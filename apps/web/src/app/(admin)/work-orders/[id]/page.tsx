import { WorkOrderDetailPage } from "@/features/work-orders/WorkOrderDetailPage";
import { WorkOrdersIntl } from "@/features/work-orders/WorkOrdersIntl";

export default async function WorkOrderPage({ params }: { readonly params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <WorkOrdersIntl>
      <WorkOrderDetailPage id={id} />
    </WorkOrdersIntl>
  );
}
