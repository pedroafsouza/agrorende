import { CostsPage } from "@/features/costs/CostsPage";
import { OpsIntl } from "@/features/ops/OpsIntl";

export default function CostsRoute() {
  return (
    <OpsIntl>
      <CostsPage />
    </OpsIntl>
  );
}
