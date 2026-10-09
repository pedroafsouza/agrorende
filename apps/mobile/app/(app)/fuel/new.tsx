import { useLocalSearchParams } from "expo-router";

import { FuelNewScreen } from "../../../src/features/fuel";
import { routeKeys } from "../../../src/i18n";

export default function Route() {
  const { assetId } = useLocalSearchParams<{ assetId?: string }>();
  return <FuelNewScreen {...(typeof assetId === "string" && assetId.length > 0 ? { assetId } : {})} />;
}

export const titleKey = routeKeys.fuelNew;
