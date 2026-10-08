import { useRouter } from "expo-router";
import { useState } from "react";

import { useServices } from "../../lib/services";
import { Banner, Screen } from "../../ui";
import { findAssetByCode, rememberAsset, scanDestination, type ScanPurpose } from "./logic";
import { ScanView } from "./ScanView";

/** Full-screen scanner (PLT-05, RN-04). `expect` guards check-in against the wrong machine. */
export function ScanScreen({ purpose, expect }: { readonly purpose: ScanPurpose; readonly expect?: string }) {
  const router = useRouter();
  const services = useServices();
  const [errorCode, setErrorCode] = useState<string | undefined>(undefined);

  async function onCode(token: string): Promise<void> {
    const db = services.db;
    if (db === undefined) return;
    const asset = await findAssetByCode(db, token);
    if (asset === undefined) {
      setErrorCode("REPORT_MACHINE_NOT_FOUND");
      return;
    }
    if (expect !== undefined && asset.id !== expect) {
      setErrorCode("RENTAL_ASSET_MISMATCH");
      return;
    }
    setErrorCode(undefined);
    await rememberAsset(db, asset.id);
    if (expect !== undefined) router.back();
    else router.replace(scanDestination(purpose, asset.id) as never);
  }

  return (
    <Screen testID="scan" scroll={false}>
      {errorCode === undefined ? null : <Banner tone="error" titleKey={`errors.${errorCode}.title`} bodyKey={`errors.${errorCode}.body`} />}
      <ScanView fullScreen onCode={onCode} />
    </Screen>
  );
}
