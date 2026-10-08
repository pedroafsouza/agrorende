import { useLocalSearchParams } from "expo-router";

import { JobChecklistScreen } from "../../../../src/features/jobs";
import { routeKeys } from "../../../../src/i18n";

export default function Route() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <JobChecklistScreen id={id} />;
}

export const titleKey = routeKeys.jobChecklist;
