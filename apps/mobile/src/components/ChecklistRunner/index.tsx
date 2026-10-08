import type { ChecklistItem, ChecklistResponse } from "@agrorende/contracts/checklist";
import { Camera, Check, CircleSlash, OctagonAlert, X } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { useLocale, useT } from "../../i18n/useT";
import { Badge, BottomSheet, Button, Card, Chip, Icon, NumberField, Segmented, Text, TextField, hapticWarning, useTheme } from "../../ui";
import { checklistProgress, isAnswered, localized, photoRequired, responseFor, upsertResponse, type ChecklistValue } from "./logic";

export * from "./logic";

export type ChecklistRunnerProps = {
  readonly items: readonly ChecklistItem[];
  readonly responses: readonly ChecklistResponse[];
  readonly previousResponses?: readonly ChecklistResponse[];
  readonly onChange: (responses: readonly ChecklistResponse[]) => void;
  /** Called when an `isSafetyCritical` item fails; the caller queues ON_HOLD SAFETY (WO-08). */
  readonly onSafetyStop?: (item: ChecklistItem) => void;
  /** Opens capture for the item's photos; the caller appends media ids through `onChange`. */
  readonly onCapturePhoto?: (item: ChecklistItem) => void;
  readonly now?: () => number;
  readonly readOnly?: boolean;
};

const PASS_FAIL_NA = [
  { value: "PASS", labelKey: "ui.checklist.pass", icon: Check, tone: "success" },
  { value: "FAIL", labelKey: "ui.checklist.fail", icon: X, tone: "danger" },
  { value: "NA", labelKey: "ui.checklist.na", icon: CircleSlash, tone: "neutral" },
] as const;

function previousLabelKey(value: ChecklistValue | undefined): string | undefined {
  if (value === "PASS") return "ui.checklist.pass";
  if (value === "FAIL") return "ui.checklist.fail";
  if (value === "NA") return "ui.checklist.na";
  return undefined;
}

/** Renders a checklist by item type with big PASS/FAIL/NA buttons and "x of y answered" (§13.3). */
export function ChecklistRunner({ items, responses, previousResponses, onChange, onSafetyStop, onCapturePhoto, now = Date.now, readOnly = false }: ChecklistRunnerProps) {
  const locale = useLocale();
  const t = useT();
  const theme = useTheme();
  const progress = checklistProgress(items, responses);
  const [stopItem, setStopItem] = useState<ChecklistItem | undefined>();

  const answer = (item: ChecklistItem, value: ChecklistValue, note?: string) => {
    const current = responseFor(responses, item.key);
    const next: ChecklistResponse = {
      key: item.key,
      value,
      mediaIds: current?.mediaIds ?? [],
      answeredAt: new Date(now()).toISOString(),
      ...(note === undefined ? (current?.note === undefined ? {} : { note: current.note }) : { note }),
    };
    onChange(upsertResponse(responses, next));
    if (item.isSafetyCritical && value === "FAIL" && current?.value !== "FAIL") {
      hapticWarning();
      setStopItem(item);
    }
  };

  let section: string | undefined;
  return (
    <View testID="checklist-runner" style={styles.list}>
      <Text testID="checklist-progress" i18nKey="ui.checklist.progress" values={{ answered: progress.answered, total: progress.total }} variant="label" tone="secondary" />
      {items.map((item) => {
        const response = responseFor(responses, item.key);
        const previous = previousResponses === undefined ? undefined : responseFor(previousResponses, item.key);
        const header = item.section !== undefined && item.section !== section ? item.section : undefined;
        section = item.section ?? section;
        const needsPhoto = photoRequired(item, response);
        const prevKey = previousLabelKey(previous?.value);
        return (
          <View key={item.key} style={styles.list}>
            {header === undefined ? null : (
              <Text variant="heading" accessibilityRole="header">
                {header}
              </Text>
            )}
            <Card testID={`checklist-item-${item.key}`}>
              <View style={styles.titleRow}>
                <Text variant="label" style={styles.flex}>
                  {localized(item.label, locale)}
                </Text>
                {item.required ? <Badge labelKey="ui.checklist.required" tone="neutral" /> : null}
              </View>
              <View style={styles.badges}>
                {item.isSafetyCritical ? <Badge labelKey="ui.checklist.safetyCritical" tone="danger" /> : null}
                {needsPhoto ? <Badge labelKey="ui.checklist.photoRequired" tone={response !== undefined && response.mediaIds.length > 0 ? "success" : "warning"} /> : null}
                {isAnswered(item, response) ? <Badge labelKey="ui.checklist.answered" tone="success" /> : null}
              </View>
              {previous === undefined ? null : (
                <Text testID={`checklist-previous-${item.key}`} tone="secondary" variant="caption" i18nKey="ui.checklist.previous" values={{ value: prevKey === undefined ? String(previous.value ?? "-") : t(prevKey) }} />
              )}
              {item.type === "PASS_FAIL_NA" ? (
                <Segmented
                  testID={`checklist-answer-${item.key}`}
                  large
                  options={PASS_FAIL_NA}
                  value={typeof response?.value === "string" ? (response.value as "PASS" | "FAIL" | "NA") : undefined}
                  onChange={(value) => {
                    if (!readOnly) answer(item, value);
                  }}
                />
              ) : null}
              {item.type === "NUMBER" ? (
                <NumberField
                  testID={`checklist-number-${item.key}`}
                  labelKey="ui.checklist.value"
                  value={typeof response?.value === "number" ? response.value : undefined}
                  {...(item.min === undefined ? {} : { min: item.min })}
                  {...(item.max === undefined ? {} : { max: item.max })}
                  onChange={(value) => answer(item, value ?? null)}
                />
              ) : null}
              {item.type === "TEXT" ? (
                <TextField labelKey="ui.checklist.value" editable={!readOnly} value={typeof response?.value === "string" ? response.value : ""} onChangeText={(value) => answer(item, value.length === 0 ? null : value)} />
              ) : null}
              {item.type === "SELECT" ? (
                <View style={styles.badges}>
                  {(item.options ?? []).map((option) => (
                    <SelectOption key={option.value} label={localized(option.label, locale)} selected={response?.value === option.value} onPress={() => answer(item, option.value)} />
                  ))}
                </View>
              ) : null}
              {needsPhoto && onCapturePhoto !== undefined && !readOnly ? (
                <Button compact variant="secondary" icon={Camera} labelKey="ui.checklist.addPhoto" labelValues={{ count: response?.mediaIds.length ?? 0 }} onPress={() => onCapturePhoto(item)} />
              ) : null}
            </Card>
          </View>
        );
      })}
      <BottomSheet testID="checklist-stop-work" visible={stopItem !== undefined} onClose={() => setStopItem(undefined)} titleKey="ui.checklist.stopWork.title">
        <View style={styles.titleRow}>
          <Icon icon={OctagonAlert} size={32} color={theme.danger} />
          <Text style={styles.flex} i18nKey="ui.checklist.stopWork.body" values={{ item: stopItem === undefined ? "" : localized(stopItem.label, locale) }} />
        </View>
        <Button
          testID="checklist-stop-work-confirm"
          variant="danger"
          labelKey="ui.checklist.stopWork.confirm"
          onPress={() => {
            if (stopItem !== undefined) onSafetyStop?.(stopItem);
            setStopItem(undefined);
          }}
        />
        <Button variant="ghost" labelKey="ui.checklist.stopWork.back" onPress={() => setStopItem(undefined)} />
      </BottomSheet>
    </View>
  );
}

function SelectOption({ label, selected, onPress }: { readonly label: string; readonly selected: boolean; readonly onPress: () => void }) {
  return <Chip label={label} selected={selected} onPress={onPress} testID={`checklist-option-${label}`} />;
}

const styles = StyleSheet.create({
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  flex: { flex: 1 },
  list: { gap: 12 },
  titleRow: { alignItems: "center", flexDirection: "row", gap: 8 },
});
