import { BillingDetailPage } from "@/features/billing/BillingDetailPage";
import { BillingIntl } from "@/features/billing/BillingIntl";

export default async function AdminBillingDocumentPage({ params }: { readonly params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <BillingIntl>
      <BillingDetailPage id={id} />
    </BillingIntl>
  );
}
