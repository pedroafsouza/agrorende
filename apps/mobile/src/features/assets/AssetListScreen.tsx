import { useRouter } from "expo-router";
import { QrCode } from "lucide-react-native";

import { AssetPicker } from "../../components/AssetPicker";
import { useServices } from "../../lib/services";
import { Button, Screen } from "../../ui";
import { rememberAsset } from "./logic";

/** Machines: search, near me and recent (PLT-05), all from the local mirror. */
export function AssetListScreen() {
  const router = useRouter();
  const services = useServices();
  return (
    <Screen testID="assets" scroll={false} footer={<Button testID="assets-scan" labelKey="assets.action.scan" icon={QrCode} onPress={() => router.push("/scan?purpose=find")} />}>
      <AssetPicker
        initialTab="search"
        allowUnregistered={false}
        onChange={(value) => {
          if (value.assetId === undefined) return;
          if (services.db !== undefined) void rememberAsset(services.db, value.assetId);
          router.push(`/assets/${value.assetId}`);
        }}
      />
    </Screen>
  );
}
