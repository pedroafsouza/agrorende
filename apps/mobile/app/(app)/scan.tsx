import { useLocalSearchParams } from "expo-router";

import { parseScanPurpose, ScanScreen } from "../../src/features/assets";
import { routeKeys } from "../../src/i18n";

export default function Route() {
  const params = useLocalSearchParams<{ purpose?: string; expect?: string }>();
  return <ScanScreen purpose={parseScanPurpose(params.purpose)} {...(params.expect === undefined ? {} : { expect: params.expect })} />;
}

export const titleKey = routeKeys.scan;
