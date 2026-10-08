import { useLocalSearchParams } from "expo-router";

import { AssetDetailScreen } from "../../../src/features/assets";
import { routeKeys } from "../../../src/i18n";

export default function Route() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <AssetDetailScreen id={id} />;
}

export const titleKey = routeKeys.assetDetail;
