import { useLocalSearchParams } from "expo-router";

import { RentalDetailScreen } from "../../../../src/features/rentals";
import { routeKeys } from "../../../../src/i18n";

export default function Route() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <RentalDetailScreen rentalId={id} />;
}

export const titleKey = routeKeys.rentalDetail;
