import { useLocalSearchParams } from "expo-router";

import { JobPartsScreen } from "../../../../src/features/jobs";
import { routeKeys } from "../../../../src/i18n";

export default function Route() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <JobPartsScreen id={id} />;
}

export const titleKey = routeKeys.jobParts;
