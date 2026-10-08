import { useLocalSearchParams } from "expo-router";

import { CheckinWizardScreen } from "../../../../src/features/rentals";
import { routeKeys } from "../../../../src/i18n";

export default function Route() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <CheckinWizardScreen rentalId={id} />;
}

export const titleKey = routeKeys.rentalCheckin;
