import type { WorkOrderStatus } from "@agrorende/contracts/enums";
import { Package, Plus, Trash2 } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { useLocale } from "../../../i18n/useT";
import { errorCodeOf } from "../../../lib/errors";
import { useServices } from "../../../lib/services";
import { addPart, removePart } from "../../../sync/mutators/jobs";
import { BottomSheet, Button, Card, EmptyState, ErrorState, IconButton, ListItem, NumberField, Screen, Skeleton, Text, TextField, showToast } from "../../../ui";
import { InlineError } from "../../../ui/recovery/InlineError";
import "../i18n";
import { parseCents, partsTotalCents, validatePart, type PartDraft } from "../logic";
import { useJob } from "../useJob";

const EDITABLE: readonly WorkOrderStatus[] = ["ON_SITE", "IN_PROGRESS", "ON_HOLD", "COMPLETED"];
const EMPTY: PartDraft = { name: "", quantity: 1, unit: "un", unitCost: "" };

export function formatCents(cents: number, locale: string): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "BRL" }).format(cents / 100);
}

/** Parts used (WO-09): free text with optional cost; the server recomputes the parts total. */
export function JobPartsScreen({ id }: { readonly id: string }) {
  const locale = useLocale();
  const { newId } = useServices();
  const query = useJob(id);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<PartDraft>(EMPTY);
  const [invalid, setInvalid] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();

  if (query.status === "loading") return <Screen testID="job-parts-loading"><Skeleton lines={6} /></Screen>;
  if (query.status === "error") return <Screen testID="job-parts-error"><ErrorState onRetry={query.reload} /></Screen>;
  if (query.data === undefined) return <Screen testID="job-parts-missing"><EmptyState icon={Package} titleKey="jobs.detail.notFoundTitle" bodyKey="jobs.detail.notFoundBody" /></Screen>;

  const { parts, workOrder } = query.data;
  const editable = EDITABLE.includes(String(workOrder.status) as WorkOrderStatus);
  const total = partsTotalCents(parts);

  const submit = async () => {
    const check = validatePart(draft);
    if (check !== true) return setInvalid(check);
    setInvalid(undefined);
    const cents = parseCents(draft.unitCost);
    try {
      await addPart({
        id: newId?.() ?? `${Date.now()}`,
        workOrderId: id,
        name: draft.name.trim(),
        quantity: draft.quantity ?? 1,
        unit: draft.unit.trim(),
        ...(cents === undefined ? {} : { unitCostCents: cents }),
      });
      setDraft(EMPTY);
      setOpen(false);
      showToast({ messageKey: "jobs.parts.added", tone: "success" });
    } catch (err) {
      setError(errorCodeOf(err));
    }
  };

  return (
    <Screen testID="job-parts" footer={editable ? <Button testID="job-parts-add" icon={Plus} labelKey="jobs.parts.add" onPress={() => setOpen(true)} /> : undefined}>
      {error === undefined ? null : <InlineError code={error} />}
      {parts.length === 0 ? (
        <EmptyState icon={Package} titleKey="jobs.parts.emptyTitle" bodyKey="jobs.parts.emptyBody" />
      ) : (
        <>
          {parts.map((part) => (
            <ListItem
              key={String(part.id)}
              testID={`job-part-${String(part.id)}`}
              icon={Package}
              title={String(part.name ?? "")}
              subtitle={`${String(part.quantity ?? "")} ${String(part.unit ?? "")}${typeof part.unitCostCents === "number" ? ` · ${formatCents(part.unitCostCents, locale)}` : ""}`}
              right={editable ? <IconButton testID={`job-part-remove-${String(part.id)}`} icon={Trash2} labelKey="jobs.parts.remove" onPress={() => void removePart({ id: String(part.id) }).catch((err: unknown) => setError(errorCodeOf(err)))} /> : undefined}
            />
          ))}
          <Card>
            <Text testID="job-parts-total" variant="label" i18nKey="jobs.parts.total" values={{ total: formatCents(total, locale) }} />
          </Card>
        </>
      )}
      <BottomSheet testID="job-parts-sheet" visible={open} onClose={() => setOpen(false)} titleKey="jobs.parts.add">
        <View style={styles.form}>
          <TextField testID="job-part-name" labelKey="jobs.parts.name" value={draft.name} onChangeText={(name) => setDraft({ ...draft, name })} {...(invalid === "name" ? { errorKey: "jobs.parts.nameRequired" } : {})} />
          <NumberField testID="job-part-quantity" labelKey="jobs.parts.quantity" value={draft.quantity} min={0} step={1} onChange={(quantity) => setDraft({ ...draft, quantity })} {...(invalid === "quantity" ? { errorKey: "jobs.parts.quantityInvalid" } : {})} />
          <TextField testID="job-part-unit" labelKey="jobs.parts.unit" value={draft.unit} onChangeText={(unit) => setDraft({ ...draft, unit })} {...(invalid === "unit" ? { errorKey: "jobs.parts.unitRequired" } : {})} />
          <TextField testID="job-part-cost" labelKey="jobs.parts.unitCost" hintKey="jobs.parts.unitCostHint" keyboardType="decimal-pad" value={draft.unitCost} onChangeText={(unitCost) => setDraft({ ...draft, unitCost })} {...(invalid === "unitCost" ? { errorKey: "jobs.parts.unitCostInvalid" } : {})} />
          <Button testID="job-part-submit" labelKey="jobs.parts.save" onPress={() => void submit()} />
        </View>
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({ form: { gap: 12 } });
