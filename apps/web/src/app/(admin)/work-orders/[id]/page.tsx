import { BillingActions } from "@/features/billing";
import { CommentThread } from "@/features/comments";
import { WorkOrderDetailPage } from "@/features/work-orders/WorkOrderDetailPage";
import { WorkOrdersIntl } from "@/features/work-orders/WorkOrdersIntl";

export default async function WorkOrderPage({ params }: { readonly params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <WorkOrdersIntl>
      <WorkOrderDetailPage id={id} />
      <BillingActions entityId={id} entityType="WORK_ORDER" />
      <CommentThread entityId={id} entityType="WORK_ORDER" />
    </WorkOrdersIntl>
  );
}
