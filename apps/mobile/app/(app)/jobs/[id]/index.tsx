import { useLocalSearchParams } from "expo-router";

import { JobDetailScreen } from "../../../../src/features/jobs";
import { routeKeys } from "../../../../src/i18n";

export default function Route() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <JobDetailScreen id={id} />;
}

export const titleKey = routeKeys.jobDetail;
