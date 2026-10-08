import { useLocalSearchParams } from "expo-router";

import { CheckoutWizardScreen } from "../../../../src/features/rentals";
import { routeKeys } from "../../../../src/i18n";

export default function Route() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <CheckoutWizardScreen rentalId={id} />;
}

export const titleKey = routeKeys.rentalCheckout;
