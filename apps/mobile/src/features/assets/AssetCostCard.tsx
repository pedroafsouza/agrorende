import { formatMoney } from "@agrorende/i18n";
import { Wallet } from "lucide-react-native";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { useLocale } from "../../i18n/useT";
import { getApiClient } from "../../lib/app/session";
import { Button, Card, Icon, Skeleton, Text } from "../../ui";
import { assetCostSummary, type AssetCostSummary } from "./logic";

type CostState = { readonly status: "loading" } | { readonly status: "error" } | { readonly status: "ready"; readonly summary: AssetCostSummary | undefined };

const LINES = [
  ["laborCents", "assets.costs.labor"],
  ["partsCents", "assets.costs.parts"],
  ["externalCents", "assets.costs.external"],
  ["fuelCents", "assets.costs.fuel"],
  ["rentInCostCents", "assets.costs.rentIn"],
] as const;

/** Office-only cost summary for one machine, read online from the costs roll-up (PLT-06, ERP-03). */
export function AssetCostCard({ assetId, currency = "BRL" }: { readonly assetId: string; readonly currency?: string }) {
  const locale = useLocale();
  const [state, setState] = useState<CostState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setState({ status: "loading" });
    getApiClient()
      .costsRollup({ groupBy: "asset", assetId })
      .then((response) => {
        if (active) setState({ status: "ready", summary: assetCostSummary(response, assetId) });
      })
      .catch(() => {
        if (active) setState({ status: "error" });
      });
    return () => {
      active = false;
    };
  }, [assetId, attempt]);

  const money = (cents: number) => formatMoney(cents, currency, locale);
  return (
    <Card testID="asset-costs">
      <View style={styles.header}>
        <Icon icon={Wallet} size={20} />
        <Text i18nKey="assets.costs.title" variant="heading" />
      </View>
      {state.status === "loading" ? <Skeleton lines={3} /> : null}
      {state.status === "error" ? (
        <>
          <Text testID="asset-costs-error" i18nKey="assets.costs.offline" tone="secondary" />
          <Button testID="asset-costs-retry" labelKey="assets.costs.retry" variant="secondary" onPress={() => setAttempt((n) => n + 1)} />
        </>
      ) : null}
      {state.status === "ready" && state.summary === undefined ? <Text testID="asset-costs-empty" i18nKey="assets.costs.empty" tone="secondary" /> : null}
      {state.status === "ready" && state.summary !== undefined ? (
        <>
          {LINES.map(([field, key]) => (
            <View key={field} style={styles.line}>
              <Text i18nKey={key} tone="secondary" />
              <Text testID={`asset-costs-${field}`}>{money(state.summary?.[field] ?? 0)}</Text>
            </View>
          ))}
          <View style={styles.line}>
            <Text i18nKey="assets.costs.total" variant="label" />
            <Text testID="asset-costs-total" variant="label">{money(state.summary.totalCostCents)}</Text>
          </View>
          {state.summary.rentalRevenueCents > 0 ? (
            <View style={styles.line}>
              <Text i18nKey="assets.costs.revenue" tone="secondary" />
              <Text testID="asset-costs-revenue">{money(state.summary.rentalRevenueCents)}</Text>
            </View>
          ) : null}
          <Text i18nKey="assets.costs.toDate" tone="secondary" variant="caption" />
        </>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 8 },
  line: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", minHeight: 32, gap: 12 },
});
