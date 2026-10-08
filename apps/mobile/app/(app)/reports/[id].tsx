import { useLocalSearchParams } from "expo-router";

import { ReportDetailScreen } from "../../../src/features/reports";
import { routeKeys } from "../../../src/i18n";

export default function Route() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ReportDetailScreen id={id} />;
}

export const titleKey = routeKeys.reportDetail;
