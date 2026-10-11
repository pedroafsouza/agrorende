import { getCurrentPositionAsync, requestForegroundPermissionsAsync } from "expo-location";
import { Clock, HelpCircle, MapPin, QrCode, Search } from "lucide-react-native";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { CONDITION_TONE, findAssetByCode, nearbyAssets, recentAssets, rememberAsset, searchAssets, type AssetSummary } from "../features/assets/logic";
import { ScanView } from "../features/assets/ScanView";
import { LocalError, errorCodeOf } from "../lib/errors";
import { permissionStateOf, type PermissionState } from "../lib/permissions";
import { useServices } from "../lib/services";
import { EmptyState, ListItem, Segmented, Skeleton, StatusPill, TextField, Button } from "../ui";
import { InlineError } from "../ui/recovery/InlineError";
import { PermissionPrompt } from "./PermissionPrompt";

export type AssetPickerValue = { readonly assetId?: string; readonly unregisteredAssetDescription?: string };
export type AssetPickerTab = "scan" | "search" | "near" | "recent" | "unregistered";
export type AssetPickerProps = {
  readonly value?: AssetPickerValue;
  readonly onChange: (value: AssetPickerValue) => void;
  readonly initialTab?: AssetPickerTab;
  readonly allowUnregistered?: boolean;
};

const TABS = [
  { value: "scan", labelKey: "assets.picker.scan", icon: QrCode },
  { value: "search", labelKey: "assets.picker.search", icon: Search },
  { value: "near", labelKey: "assets.picker.near", icon: MapPin },
  { value: "recent", labelKey: "assets.picker.recent", icon: Clock },
  { value: "unregistered", labelKey: "assets.picker.unregistered", icon: HelpCircle },
] as const;

function AssetRow({ asset, selected, onPress }: { readonly asset: AssetSummary; readonly selected: boolean; readonly onPress: () => void }) {
  return (
    <ListItem
      testID={`asset-option-${asset.id}`}
      title={asset.name}
      {...(asset.distanceM === undefined || !Number.isFinite(asset.distanceM)
        ? { subtitle: asset.code }
        : { subtitleKey: "assets.picker.distance", subtitleValues: { code: asset.code, km: Math.round(asset.distanceM / 100) / 10 } })}
      badges={<StatusPill labelKey={selected ? "assets.picker.selected" : `assets.condition.${asset.condition}`} tone={selected ? "success" : (CONDITION_TONE[asset.condition] ?? "neutral")} />}
      onPress={onPress}
    />
  );
}

/** Asset selection: Scan · Search · Near me · Recent · Not registered (§13.3, PLT-05). Fully offline. */
export function AssetPicker({ value, onChange, initialTab = "scan", allowUnregistered = true }: AssetPickerProps) {
  const { db } = useServices();
  const [tab, setTab] = useState<AssetPickerTab>(initialTab);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<readonly AssetSummary[] | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [locationState, setLocationState] = useState<PermissionState>("granted");
  const [nonce, setNonce] = useState(0);

  const pick = (asset: AssetSummary) => {
    onChange({ assetId: asset.id });
    if (db !== undefined) rememberAsset(db, asset.id).catch(() => undefined);
  };

  useEffect(() => {
    if (db === undefined || tab === "scan" || tab === "unregistered") return;
    let active = true;
    setItems(undefined);
    setError(undefined);
    const load = async (): Promise<AssetSummary[]> => {
      if (tab === "search") return searchAssets(db, query);
      if (tab === "recent") return recentAssets(db);
      const permission = permissionStateOf(await requestForegroundPermissionsAsync());
      setLocationState(permission);
      if (permission !== "granted" && permission !== "limited") return [];
      const position = await getCurrentPositionAsync({}).catch(() => {
        throw new LocalError("GPS_UNAVAILABLE");
      });
      return nearbyAssets(db, { lat: position.coords.latitude, lng: position.coords.longitude });
    };
    const timer = setTimeout(
      () => {
        load()
          .then((rows) => {
            if (active) setItems(rows);
          })
          .catch((e: unknown) => {
            if (active) {
              setItems([]);
              setError(errorCodeOf(e, "ASSET_LOOKUP_UNAVAILABLE"));
            }
          });
      },
      tab === "search" ? 250 : 0,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [db, tab, query, nonce]);

  return (
    <View testID="asset-picker" style={styles.wrap}>
      <Segmented testID="asset-picker-tabs" options={allowUnregistered ? TABS : TABS.filter((t) => t.value !== "unregistered")} value={tab} onChange={setTab} />
      {tab === "scan" ? (
        <ScanView
          onCode={async (token) => {
            if (db === undefined) throw new LocalError("ASSET_LOOKUP_UNAVAILABLE");
            const asset = await findAssetByCode(db, token);
            if (asset === undefined) throw new LocalError("REPORT_MACHINE_NOT_FOUND");
            pick(asset);
          }}
        />
      ) : null}
      {tab === "search" ? <TextField testID="asset-search" labelKey="assets.picker.searchLabel" placeholderKey="assets.picker.searchPlaceholder" value={query} onChangeText={setQuery} autoCorrect={false} /> : null}
      {tab === "near" && locationState !== "granted" && locationState !== "limited" ? (
        <PermissionPrompt kind="locationForeground" state={locationState} onRequest={() => setNonce((n) => n + 1)} onAlternate={() => setTab("search")} />
      ) : null}
      {tab === "unregistered" ? (
        <TextField
          testID="asset-unregistered"
          labelKey="assets.picker.unregisteredLabel"
          hintKey="assets.picker.unregisteredHint"
          multiline
          value={value?.unregisteredAssetDescription ?? ""}
          onChangeText={(text) => onChange({ unregisteredAssetDescription: text })}
        />
      ) : null}
      {tab === "search" || tab === "near" || tab === "recent" ? (
        items === undefined ? (
          <Skeleton lines={3} />
        ) : items.length === 0 ? (
          error === undefined ? (
            <EmptyState
              icon={tab === "near" ? MapPin : Search}
              titleKey={tab === "recent" ? "assets.picker.recentEmpty" : "errors.OFFLINE_SEARCH_NO_RESULTS.title"}
              bodyKey={tab === "recent" ? "assets.picker.recentEmptyBody" : "errors.OFFLINE_SEARCH_NO_RESULTS.body"}
              {...(allowUnregistered ? { action: { labelKey: "assets.picker.unregistered", onPress: () => setTab("unregistered") } } : {})}
            />
          ) : null
        ) : (
          items.map((asset) => <AssetRow key={asset.id} asset={asset} selected={value?.assetId === asset.id} onPress={() => pick(asset)} />)
        )
      ) : null}
      {error === undefined ? null : (
        <View style={styles.wrap}>
          <InlineError code={error} />
          <Button compact variant="secondary" labelKey="ui.action.retry" onPress={() => setNonce((n) => n + 1)} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { gap: 12 } });
