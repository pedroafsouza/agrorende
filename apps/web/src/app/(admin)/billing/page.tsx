import { BillingIntl } from "@/features/billing/BillingIntl";
import { BillingListPage } from "@/features/billing/BillingListPage";

export default function AdminBillingPage() {
  return (
    <BillingIntl>
      <BillingListPage />
    </BillingIntl>
  );
}
