import { useLocalSearchParams } from "expo-router";

import { JobCompleteScreen } from "../../../../src/features/jobs";
import { routeKeys } from "../../../../src/i18n";

export default function Route() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <JobCompleteScreen id={id} />;
}

export const titleKey = routeKeys.jobComplete;
