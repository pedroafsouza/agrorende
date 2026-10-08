import { useRouter } from "expo-router";
import { CheckCircle2, Lock, ShieldCheck, WifiOff } from "lucide-react-native";
import { useState, useSyncExternalStore } from "react";
import { StyleSheet, View } from "react-native";

import { authStore } from "../../auth/session";
import { getApiClient } from "../../lib/app/session";
import { errorCodeOf } from "../../lib/errors";
import { useServices } from "../../lib/services";
import { useLocalQuery } from "../../lib/useLocalQuery";
import { useSyncSnapshot } from "../../ui/SyncBadge";
import { Banner, Button, Chip, EmptyState, ErrorState, NumberField, Screen, Segmented, Skeleton, Text, TextField } from "../../ui";
import { InlineError } from "../../ui/recovery/InlineError";
import "./i18n";
import { dayKey, isOfficeRole, listCustomers, listRentableAssets, loadOrgRentalSettings, zonedIso } from "./logic";

type Phase = "idle" | "checking" | "saving";

/** Office-only, online-only rental creation (§13.1): create, then reserve; eligibility codes shown inline. */
export function NewRentalScreen() {
  const router = useRouter();
  const services = useServices();
  const sync = useSyncSnapshot();
  const auth = useSyncExternalStore(authStore.subscribe, authStore.getState);
  const query = useLocalQuery(async (db) => ({ assets: await listRentableAssets(db), customers: await listCustomers(db), settings: await loadOrgRentalSettings(db) }), []);
  const now = services.now?.() ?? Date.now();
  const [assetId, setAssetId] = useState<string | undefined>();
  const [customerId, setCustomerId] = useState<string | undefined>();
  const [startDate, setStartDate] = useState<string | undefined>();
  const [startHour, setStartHour] = useState<number | undefined>(8);
  const [days, setDays] = useState<number | undefined>(1);
  const [rate, setRate] = useState<number | undefined>();
  const [deposit, setDeposit] = useState<number | undefined>();
  const [documentLocale, setDocumentLocale] = useState<"pt-BR" | "en">("pt-BR");
  const [codes, setCodes] = useState<readonly string[]>([]);
  const [eligible, setEligible] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [failure, setFailure] = useState<ReturnType<typeof errorCodeOf> | undefined>();

  if (!isOfficeRole(auth.user?.role)) {
    return (
      <Screen testID="rental-new-forbidden">
        <EmptyState icon={Lock} titleKey="rentals.new.officeOnlyTitle" bodyKey="rentals.new.officeOnlyBody" action={{ labelKey: "rentals.detail.backToList", onPress: () => router.replace("/rentals") }} />
      </Screen>
    );
  }
  if (sync.network === "offline") {
    return (
      <Screen testID="rental-new-offline">
        <EmptyState icon={WifiOff} titleKey="rentals.new.offlineTitle" bodyKey="rentals.new.offlineBody" action={{ labelKey: "rentals.detail.backToList", onPress: () => router.replace("/rentals") }} />
      </Screen>
    );
  }
  if (query.status === "loading") return <Screen testID="rental-new-loading"><Skeleton lines={8} /></Screen>;
  if (query.status === "error") return <Screen testID="rental-new-error"><ErrorState onRetry={query.reload} /></Screen>;
  const { assets, customers, settings } = query.data;
  const date = startDate ?? dayKey(now, settings.timeZone);
  const plannedStart = startHour === undefined ? undefined : zonedIso(date, startHour, settings.timeZone);
  const plannedEnd = plannedStart === undefined || days === undefined || days <= 0 ? undefined : new Date(Date.parse(plannedStart) + days * 86_400_000).toISOString();
  const ready = assetId !== undefined && customerId !== undefined && plannedStart !== undefined && plannedEnd !== undefined;
  const reset = () => {
    setEligible(false);
    setCodes([]);
    setFailure(undefined);
  };

  const check = async () => {
    if (!ready) return;
    setPhase("checking");
    setFailure(undefined);
    try {
      const result = await getApiClient().rentalEligibility({ assetId, from: plannedStart, to: plannedEnd });
      setEligible(result.eligible);
      setCodes(result.codes);
    } catch (error) {
      setFailure(errorCodeOf(error));
    } finally {
      setPhase("idle");
    }
  };

  const save = async () => {
    if (!ready) return;
    setPhase("saving");
    setFailure(undefined);
    const id = services.newId?.() ?? `${now}`;
    try {
      const api = getApiClient();
      await api.createRental({
        id,
        direction: "OUTBOUND",
        assetId,
        customerId,
        plannedStart,
        plannedEnd,
        documentLocale,
        ...(rate === undefined ? {} : { rateCents: Math.round(rate * 100), rateUnit: "DAY" as const }),
        ...(deposit === undefined ? {} : { depositCents: Math.round(deposit * 100) }),
      });
      await api.reserveRental(id);
      services.syncNow?.().catch(() => undefined);
      router.replace(`/rentals/${id}`);
    } catch (error) {
      setFailure(errorCodeOf(error));
      setPhase("idle");
    }
  };

  const footer = eligible ? (
    <Button testID="rental-new-save" icon={CheckCircle2} labelKey="rentals.new.createReserve" disabled={!ready || phase !== "idle"} loading={phase === "saving"} haptic onPress={() => void save()} />
  ) : (
    <Button testID="rental-new-check" icon={ShieldCheck} labelKey="rentals.new.check" disabled={!ready || phase !== "idle"} loading={phase === "checking"} onPress={() => void check()} />
  );

  return (
    <Screen testID="rental-new" footer={footer}>
      <Text i18nKey="rentals.new.asset" variant="label" />
      {assets.length === 0 ? <Text testID="rental-new-no-assets" i18nKey="rentals.new.noAssets" tone="secondary" /> : null}
      <View style={styles.chips}>
        {assets.map((asset) => (
          <Chip key={asset.id} testID={`rental-new-asset-${asset.id}`} label={asset.detail === null ? asset.label : `${asset.label} · ${asset.detail}`} selected={assetId === asset.id} onPress={() => { setAssetId(asset.id); reset(); }} />
        ))}
      </View>
      <Text i18nKey="rentals.new.customer" variant="label" />
      {customers.length === 0 ? <Text testID="rental-new-no-customers" i18nKey="rentals.new.noCustomers" tone="secondary" /> : null}
      <View style={styles.chips}>
        {customers.map((customer) => (
          <Chip key={customer.id} testID={`rental-new-customer-${customer.id}`} label={customer.detail === null ? customer.label : `${customer.label} · ${customer.detail}`} selected={customerId === customer.id} onPress={() => { setCustomerId(customer.id); reset(); }} />
        ))}
      </View>
      <TextField testID="rental-new-date" labelKey="rentals.new.startDate" hintKey="rentals.new.dateHint" value={date} onChangeText={(value) => { setStartDate(value); reset(); }} keyboardType="numbers-and-punctuation" {...(zonedIso(date, 0, settings.timeZone) === undefined ? { errorKey: "rentals.new.dateInvalid" } : {})} />
      <NumberField testID="rental-new-hour" labelKey="rentals.new.startHour" min={0} max={23} value={startHour} onChange={(value) => { setStartHour(value); reset(); }} />
      <NumberField testID="rental-new-days" labelKey="rentals.new.days" min={1} value={days} onChange={(value) => { setDays(value); reset(); }} />
      <NumberField testID="rental-new-rate" labelKey="rentals.new.rate" unitKey="rentals.new.perDay" min={0} step={100} value={rate} onChange={setRate} />
      <NumberField testID="rental-new-deposit" labelKey="rentals.new.deposit" min={0} step={100} value={deposit} onChange={setDeposit} />
      <Text i18nKey="rentals.new.documentLocale" variant="label" />
      <Segmented testID="rental-new-locale" value={documentLocale} onChange={setDocumentLocale} options={[{ value: "pt-BR", labelKey: "rentals.wizard.locale.ptBR" }, { value: "en", labelKey: "rentals.wizard.locale.en" }]} />
      {eligible && codes.length === 0 ? <Banner testID="rental-new-eligible" tone="success" titleKey="rentals.new.eligible" /> : null}
      {codes.map((code) => (
        <Banner key={code} testID={`rental-new-code-${code}`} tone={eligible ? "warning" : "error"} titleKey={`errors.${code}.title`} bodyKey={`errors.${code}.body`} />
      ))}
      {failure === undefined ? null : <InlineError testID="rental-new-failure" code={failure} />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
