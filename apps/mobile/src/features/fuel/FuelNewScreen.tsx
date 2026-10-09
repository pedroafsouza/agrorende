import { formatMoney } from "@agrorende/i18n";
import { useRouter } from "expo-router";
import { Fuel, Save } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { AssetPicker } from "../../components/AssetPicker";
import { MediaCapture } from "../../components/MediaCapture";
import { useLocale } from "../../i18n/useT";
import { errorCodeOf } from "../../lib/errors";
import { useServices } from "../../lib/services";
import { createFuelLog } from "../../sync/mutators/fuel";
import { Button, Card, Icon, NumberField, Screen, Text, TextField } from "../../ui";
import { InlineError } from "../../ui/recovery/InlineError";
import "./i18n";
import { buildFuelPayload, FUEL_MEDIA_TAGS, fuelTotalCents, LITERS_STEP, newFuelDraft, validateFuelDraft, type FuelDraft, type FuelFieldErrors } from "./logic";

export type FuelNewScreenProps = { readonly assetId?: string };

/**
 * Fuel log (ERP-07, OFF-01): machine, litres with big steppers, price, readings and a pump photo.
 * Saving writes the log locally and queues `fuelLog.create`, so it works with no signal and syncs once.
 */
export function FuelNewScreen({ assetId }: FuelNewScreenProps) {
  const router = useRouter();
  const services = useServices();
  const locale = useLocale();
  const [draft, setDraft] = useState<FuelDraft>(() => newFuelDraft(services.newId?.() ?? `${Date.now()}`, assetId));
  const [errors, setErrors] = useState<FuelFieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const update = (patch: Partial<FuelDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setErrors({});
    setFailure(null);
  };
  const total = fuelTotalCents(draft);

  const save = async () => {
    const found = validateFuelDraft(draft);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setSaving(true);
    try {
      await createFuelLog(buildFuelPayload(draft));
      if (draft.assetId !== undefined) router.replace(`/assets/${draft.assetId}`);
      else router.back();
    } catch (error) {
      setFailure(errorCodeOf(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen testID="fuel-new" footer={<Button testID="fuel-save" labelKey="fuel.new.save" icon={Save} loading={saving} onPress={() => void save()} />}>
      <Text i18nKey="fuel.new.offlineHint" tone="secondary" />
      <Text i18nKey="fuel.new.machine" variant="heading" />
      <AssetPicker value={draft.assetId === undefined ? {} : { assetId: draft.assetId }} initialTab={draft.assetId === undefined ? "scan" : "recent"} allowUnregistered={false} onChange={(value) => update({ assetId: value.assetId })} />
      {errors.assetId === undefined ? null : <InlineError testID="fuel-asset-error" messageKey={errors.assetId} />}
      <Card>
        <NumberField testID="fuel-liters" labelKey="fuel.fields.liters" unitKey="fuel.units.liters" value={draft.liters} step={LITERS_STEP} min={0} errorKey={errors.liters} onChange={(liters) => update({ liters })} />
        <NumberField testID="fuel-price" labelKey="fuel.fields.pricePerLiter" unitKey="fuel.units.perLiter" value={draft.pricePerLiter} step={0.1} min={0} errorKey={errors.pricePerLiter} onChange={(pricePerLiter) => update({ pricePerLiter })} />
        {total === undefined ? null : (
          <View style={styles.total}>
            <Icon icon={Fuel} size={18} />
            <Text testID="fuel-total" i18nKey="fuel.new.total" values={{ total: formatMoney(total, "BRL", locale) }} variant="label" />
          </View>
        )}
      </Card>
      <Card>
        <NumberField testID="fuel-hour-meter" labelKey="fuel.fields.hourMeter" unitKey="fuel.units.hours" value={draft.hourMeter} step={1} min={0} errorKey={errors.hourMeter} onChange={(hourMeter) => update({ hourMeter })} />
        <NumberField testID="fuel-odometer" labelKey="fuel.fields.odometerKm" unitKey="fuel.units.km" value={draft.odometerKm} step={1} min={0} errorKey={errors.odometerKm} onChange={(odometerKm) => update({ odometerKm })} />
        <Text i18nKey="fuel.new.readingsHint" tone="secondary" variant="caption" />
      </Card>
      <Text i18nKey="fuel.new.photo" variant="heading" />
      <MediaCapture parent={{ type: "FUEL_LOG", id: draft.id }} allowedTags={FUEL_MEDIA_TAGS} value={draft.media} onChange={(media) => update({ media })} />
      <TextField testID="fuel-notes" labelKey="fuel.fields.notes" value={draft.notes} multiline onChangeText={(notes) => update({ notes })} />
      {failure === null ? null : <InlineError testID="fuel-save-error" code={failure} />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  total: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 48 },
});
