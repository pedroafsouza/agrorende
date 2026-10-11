import { Stack, useRouter } from "expo-router";
import { ClipboardList, FilePlus2, FileText, Fuel, Gauge, Truck } from "lucide-react-native";
import { useSyncExternalStore } from "react";

import { authStore } from "../../auth/session";
import { MapPreview } from "../../components/MapPreview";
import { useLocalQuery } from "../../lib/useLocalQuery";
import "../fuel/i18n";
import { Button, Card, EmptyState, ErrorState, ListItem, Screen, Skeleton, StatusPill, Text } from "../../ui";
import { consumptionPerHour, listAssetFuelLogs } from "../fuel/logic";
import { loadOrgRentalSettings } from "../rentals/logic";
import { formatRelative } from "../sync/format";
import { AssetCostCard } from "./AssetCostCard";
import { assetHistory, canSeeAssetCosts, CONDITION_TONE, getAsset } from "./logic";

const HISTORY_ICON = { report: FileText, job: ClipboardList, rental: Truck } as const;

/** Asset profile with local history, fuel, office costs and the New report / Check-out / Add fuel shortcuts (PLT-06). */
export function AssetDetailScreen({ id }: { readonly id: string }) {
  const router = useRouter();
  const role = useSyncExternalStore(authStore.subscribe, authStore.getState).user?.role;
  const query = useLocalQuery(async (db) => {
    const asset = await getAsset(db, id);
    if (asset === undefined) return undefined;
    const fuelLogs = await listAssetFuelLogs(db, id);
    const settings = await loadOrgRentalSettings(db);
    return { asset, history: await assetHistory(db, id), fuelLogs, currency: settings.currency };
  }, [id]);

  if (query.status === "loading") return <Screen><Skeleton lines={6} /></Screen>;
  if (query.status === "error") return <Screen><ErrorState onRetry={query.reload} /></Screen>;
  if (query.data === undefined) {
    return (
      <Screen>
        <EmptyState icon={Gauge} titleKey="errors.REPORT_MACHINE_NOT_FOUND.title" bodyKey="errors.REPORT_MACHINE_NOT_FOUND.body" action={{ labelKey: "assets.action.scan", onPress: () => router.replace("/scan?purpose=find") }} />
      </Screen>
    );
  }
  const { asset, history, fuelLogs, currency } = query.data;
  const consumption = consumptionPerHour(fuelLogs);
  const name = String(asset.name ?? "");
  const condition = String(asset.condition ?? "OPERATIONAL");
  const lat = typeof asset.lastLat === "number" ? asset.lastLat : undefined;
  const lng = typeof asset.lastLng === "number" ? asset.lastLng : undefined;

  return (
    <Screen
      testID="asset-detail"
      footer={
        <>
          <Button testID="asset-new-report" labelKey="assets.action.newReport" icon={FilePlus2} onPress={() => router.push(`/reports/new?assetId=${id}`)} />
          <Button testID="asset-checkout" labelKey="assets.action.checkout" icon={Truck} variant="secondary" onPress={() => router.push(`/rentals/new?assetId=${id}`)} />
          <Button testID="asset-add-fuel" labelKey="fuel.history.add" icon={Fuel} variant="secondary" onPress={() => router.push(`/fuel/new?assetId=${id}`)} />
        </>
      }
    >
      <Stack.Screen options={{ title: name }} />
      <Card>
        <Text variant="title">{name}</Text>
        <Text tone="secondary">{[asset.code, asset.plate, asset.serialNumber].filter((part) => typeof part === "string" && part.length > 0).join(" · ")}</Text>
        <StatusPill labelKey={`assets.condition.${condition}`} tone={CONDITION_TONE[condition] ?? "neutral"} />
        {typeof asset.hourMeter === "number" ? <Text i18nKey="assets.detail.hourMeter" values={{ value: asset.hourMeter }} /> : null}
      </Card>
      {lat !== undefined && lng !== undefined ? <MapPreview destination={{ lat, lng, label: name }} markers={[{ id, lat, lng, label: name }]} /> : null}
      {canSeeAssetCosts(role) ? <AssetCostCard assetId={id} currency={currency} /> : null}
      <Text i18nKey="fuel.history.title" variant="heading" />
      <Text testID="asset-fuel-consumption" tone="secondary" i18nKey={consumption === undefined ? "fuel.history.noConsumption" : "fuel.history.consumption"} values={consumption === undefined ? undefined : { litersPerHour: consumption.litersPerHour, hours: consumption.hours }} />
      {fuelLogs.length === 0 ? <Text testID="asset-fuel-empty" i18nKey="fuel.history.empty" tone="secondary" /> : null}
      {fuelLogs.slice(0, 5).map((log) => (
        <ListItem
          key={log.id}
          testID={`asset-fuel-${log.id}`}
          icon={Fuel}
          titleKey="fuel.history.row"
          titleValues={{ liters: log.liters }}
          subtitle={formatRelative(log.filledAt, Date.now())}
          badges={log.dirty ? <StatusPill labelKey="fuel.history.pending" tone="warning" /> : undefined}
        />
      ))}
      <Text i18nKey="assets.detail.history" variant="heading" />
      {history.length === 0 ? <EmptyState icon={FileText} titleKey="assets.detail.historyEmpty" bodyKey="assets.detail.historyEmptyBody" /> : null}
      {history.map((item) => (
        <ListItem
          key={`${item.kind}-${item.id}`}
          icon={HISTORY_ICON[item.kind]}
          title={item.title ?? item.number ?? undefined}
          titleKey={item.title === null && item.number === null ? `assets.history.${item.kind}` : undefined}
          subtitle={formatRelative(item.at, Date.now())}
          badges={<StatusPill labelKey={`assets.status.${item.status}`} tone="neutral" />}
          onPress={() => router.push(item.kind === "report" ? `/reports/${item.id}` : item.kind === "job" ? `/jobs/${item.id}` : `/rentals/${item.id}`)}
        />
      ))}
    </Screen>
  );
}
