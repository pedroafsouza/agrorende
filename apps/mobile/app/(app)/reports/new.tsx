import { useLocalSearchParams } from "expo-router";

import { ReportWizardScreen } from "../../../src/features/reports";
import { routeKeys } from "../../../src/i18n";

export default function Route() {
  const { assetId, draftId } = useLocalSearchParams<{ assetId?: string; draftId?: string }>();
  return <ReportWizardScreen {...(typeof assetId === "string" && assetId.length > 0 ? { assetId } : {})} {...(typeof draftId === "string" && draftId.length > 0 ? { draftId } : {})} />;
}

export const titleKey = routeKeys.reportNew;
