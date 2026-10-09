import type { WorkOrderStatus } from "@agrorende/contracts/enums";
import { Boxes, Package, PenLine, Plus, Search, Trash2, Truck } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { useLocale, useT } from "../../../i18n/useT";
import { errorCodeOf } from "../../../lib/errors";
import { useServices } from "../../../lib/services";
import { useLocalQuery } from "../../../lib/useLocalQuery";
import { addPart, removePart, transitionWorkOrder } from "../../../sync/mutators/jobs";
import { Badge, Banner, BottomSheet, Button, Card, EmptyState, ErrorState, IconButton, ListItem, NumberField, Screen, Segmented, Skeleton, Text, TextField, showToast } from "../../../ui";
import { InlineError } from "../../../ui/recovery/InlineError";
import "../i18n";
import { parseCents, partsTotalCents, validatePart, type PartDraft } from "../logic";
import { useJob } from "../useJob";
import { findPartStockRejection, loadPartCatalog, searchCatalog, settlePartStockRejection, stockCheck, type CatalogItem, type PartStockRejection } from "./catalog";
import { PartStockSheet } from "./PartStockSheet";

const EDITABLE: readonly WorkOrderStatus[] = ["ON_SITE", "IN_PROGRESS", "ON_HOLD", "COMPLETED"];
const EMPTY: PartDraft = { name: "", quantity: 1, unit: "un", unitCost: "" };
const PICKER_LIMIT = 30;

type Mode = "catalog" | "free";

export function formatCents(cents: number, locale: string): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "BRL" }).format(cents / 100);
}

function centsText(cents: number | null): string {
  return cents === null ? "" : (cents / 100).toFixed(2).replace(".", ",");
}

/**
 * Parts used (WO-09). P1: a catalog picker that lists the technician's van stock first and
 * lowers it, with free text as the fallback; a part missing from the van opens the EC-WO-20 sheet.
 */
export function JobPartsScreen({ id }: { readonly id: string }) {
  const locale = useLocale();
  const t = useT();
  const { newId, userId, db, now } = useServices();
  const query = useJob(id);
  const catalog = useLocalQuery((local) => loadPartCatalog(local, userId), [userId]);
  const rejection = useLocalQuery((local) => findPartStockRejection(local, id), [id]);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("catalog");
  const [search, setSearch] = useState("");
  const [chosen, setChosen] = useState<CatalogItem | undefined>();
  const [draft, setDraft] = useState<PartDraft>(EMPTY);
  const [invalid, setInvalid] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [stockSheet, setStockSheet] = useState<"draft" | "rejected" | undefined>();

  if (query.status === "loading") return <Screen testID="job-parts-loading"><Skeleton lines={6} /></Screen>;
  if (query.status === "error") return <Screen testID="job-parts-error"><ErrorState onRetry={query.reload} /></Screen>;
  if (query.data === undefined) return <Screen testID="job-parts-missing"><EmptyState icon={Package} titleKey="jobs.detail.notFoundTitle" bodyKey="jobs.detail.notFoundBody" /></Screen>;

  const { parts, workOrder } = query.data;
  const status = String(workOrder.status) as WorkOrderStatus;
  const editable = EDITABLE.includes(status);
  const canHold = status === "IN_PROGRESS" && workOrder.assigneeId === userId;
  const total = partsTotalCents(parts);
  const items = catalog.data?.items ?? [];
  const hasCatalog = items.length > 0;
  const activeMode: Mode = hasCatalog ? mode : "free";
  const found = searchCatalog(items, search).slice(0, PICKER_LIMIT);
  const rejected: PartStockRejection | undefined = rejection.data;
  const nowIso = () => new Date(now?.() ?? Date.now()).toISOString();
  const lineId = () => newId?.() ?? `${Date.now()}`;

  const reset = () => {
    setDraft(EMPTY);
    setChosen(undefined);
    setSearch("");
    setInvalid(undefined);
  };

  const openForm = () => {
    reset();
    setMode(hasCatalog ? "catalog" : "free");
    setOpen(true);
  };

  const choose = (item: CatalogItem) => {
    setChosen(item);
    setDraft({ name: item.name, quantity: 1, unit: item.unit, unitCost: centsText(item.unitCostCents) });
    setInvalid(undefined);
  };

  /** Keeps what was typed and moves it to the free-text form (EC-WO-20 ALT, "not in catalog"). */
  const toFreeText = () => {
    setChosen(undefined);
    setMode("free");
    setOpen(true);
  };

  const submit = async () => {
    const check = validatePart(draft);
    if (check !== true) return setInvalid(check);
    setInvalid(undefined);
    const quantity = draft.quantity ?? 1;
    const cents = parseCents(draft.unitCost);
    if (activeMode === "catalog") {
      if (chosen === undefined) return setInvalid("name");
      if (stockCheck(chosen, quantity) !== undefined) {
        setOpen(false);
        setStockSheet("draft");
        return undefined;
      }
    }
    try {
      await addPart({
        id: lineId(),
        workOrderId: id,
        name: draft.name.trim(),
        quantity,
        unit: draft.unit.trim(),
        ...(cents === undefined ? {} : { unitCostCents: cents }),
        ...(activeMode === "catalog" && chosen !== undefined && chosen.vanLocationId !== null
          ? { partId: chosen.partId, stockLocationId: chosen.vanLocationId, ...(chosen.sku.length > 0 ? { partNumber: chosen.sku } : {}) }
          : {}),
      });
      reset();
      setOpen(false);
      showToast({ messageKey: "jobs.parts.added", tone: "success" });
    } catch (err) {
      setError(errorCodeOf(err));
    }
    return undefined;
  };

  const holdForParts = async (name: string, quantity: number, unit: string) => {
    try {
      await transitionWorkOrder({ id, action: "hold", holdReason: "WAITING_PARTS", note: t("parts.stock.holdNote", { name, quantity, unit }) });
      showToast({ messageKey: "parts.stock.savedHold", tone: "success" });
      return true;
    } catch (err) {
      setError(errorCodeOf(err));
      return false;
    }
  };

  const onSheetFreeText = async () => {
    if (stockSheet !== "rejected" || rejected === undefined) return toFreeText();
    if (db === undefined) return undefined;
    try {
      await addPart({ id: lineId(), workOrderId: id, name: rejected.name, quantity: rejected.quantity, unit: rejected.unit });
      await settlePartStockRejection(db, rejected, nowIso());
      showToast({ messageKey: "parts.stock.savedFreeText", tone: "success" });
    } catch (err) {
      setError(errorCodeOf(err));
    }
    return undefined;
  };

  const onSheetHold = async () => {
    const source = stockSheet === "rejected" && rejected !== undefined ? rejected : { name: draft.name.trim(), quantity: draft.quantity ?? 1, unit: draft.unit.trim() };
    const held = await holdForParts(source.name, source.quantity, source.unit);
    if (held && stockSheet === "rejected" && rejected !== undefined && db !== undefined) await settlePartStockRejection(db, rejected, nowIso());
    if (held && stockSheet === "draft") reset();
  };

  return (
    <Screen testID="job-parts" footer={editable ? <Button testID="job-parts-add" icon={Plus} labelKey="jobs.parts.add" onPress={openForm} /> : undefined}>
      {error === undefined ? null : <InlineError code={error} />}
      {rejected === undefined ? null : (
        <Banner
          testID="job-parts-rejected"
          tone="warning"
          titleKey="parts.stock.rejectedTitle"
          bodyKey="parts.stock.rejectedBody"
          bodyValues={{ name: rejected.name, quantity: rejected.quantity, unit: rejected.unit }}
          action={{ labelKey: "errors.WO_PART_NOT_IN_VAN_STOCK.action", onPress: () => setStockSheet("rejected") }}
        />
      )}
      {parts.length === 0 ? (
        <EmptyState icon={Package} titleKey="jobs.parts.emptyTitle" bodyKey="jobs.parts.emptyBody" />
      ) : (
        <>
          {parts.map((part) => {
            const fromVan = typeof part.partId === "string" && typeof part.stockLocationId === "string";
            const cost = typeof part.unitCostCents === "number" ? ` · ${formatCents(part.unitCostCents, locale)}` : "";
            return (
              <ListItem
                key={String(part.id)}
                testID={`job-part-${String(part.id)}`}
                icon={fromVan ? Truck : PenLine}
                title={String(part.name ?? "")}
                subtitle={`${t(fromVan ? "parts.line.fromVan" : "parts.line.freeText")} · ${String(part.quantity ?? "")} ${String(part.unit ?? "")}${cost}`}
                right={editable ? <IconButton testID={`job-part-remove-${String(part.id)}`} icon={Trash2} labelKey="jobs.parts.remove" onPress={() => void removePart({ id: String(part.id) }).catch((err: unknown) => setError(errorCodeOf(err)))} /> : undefined}
              />
            );
          })}
          <Card>
            <Text testID="job-parts-total" variant="label" i18nKey="jobs.parts.total" values={{ total: formatCents(total, locale) }} />
          </Card>
        </>
      )}
      <BottomSheet testID="job-parts-sheet" visible={open} onClose={() => setOpen(false)} titleKey="jobs.parts.add">
        <View style={styles.form}>
          {hasCatalog ? (
            <Segmented<Mode>
              testID="job-part-mode"
              options={[
                { value: "catalog", labelKey: "parts.picker.fromCatalog", icon: Boxes },
                { value: "free", labelKey: "parts.picker.freeText", icon: PenLine },
              ]}
              value={activeMode}
              onChange={(next) => {
                setMode(next);
                if (next === "free") setChosen(undefined);
              }}
            />
          ) : null}
          {activeMode === "catalog" && chosen === undefined ? (
            <>
              {catalog.data?.vanName == null ? <Text testID="job-part-no-van" variant="caption" i18nKey="parts.picker.noVan" /> : <Text variant="caption" i18nKey="parts.picker.vanName" values={{ name: catalog.data.vanName }} />}
              <TextField testID="job-part-search" labelKey="parts.picker.search" hintKey="parts.picker.searchHint" value={search} onChangeText={setSearch} />
              {found.length === 0 ? (
                <EmptyState icon={Search} titleKey="parts.picker.emptyTitle" bodyKey="parts.picker.emptyBody" />
              ) : (
                found.map((item) => (
                  <ListItem
                    key={item.partId}
                    testID={`job-part-pick-${item.partId}`}
                    icon={item.vanQuantity > 0 ? Truck : Package}
                    title={item.name}
                    subtitle={item.sku}
                    right={item.vanQuantity > 0 ? <Badge tone="success" labelKey="parts.picker.inVan" values={{ quantity: item.vanQuantity }} /> : <Badge tone="warning" labelKey="parts.picker.notInVan" />}
                    onPress={() => choose(item)}
                  />
                ))
              )}
              <Button testID="job-part-not-in-catalog" variant="secondary" icon={PenLine} labelKey="parts.picker.notInCatalog" onPress={() => setMode("free")} />
            </>
          ) : null}
          {activeMode === "catalog" && chosen !== undefined ? (
            <>
              <ListItem
                testID="job-part-chosen"
                icon={chosen.vanQuantity > 0 ? Truck : Package}
                titleKey="parts.picker.chosen"
                titleValues={{ name: chosen.name }}
                subtitle={chosen.sku}
                right={chosen.vanQuantity > 0 ? <Badge tone="success" labelKey="parts.picker.inVan" values={{ quantity: chosen.vanQuantity }} /> : <Badge tone="warning" labelKey="parts.picker.notInVan" />}
              />
              <Button testID="job-part-change" variant="ghost" labelKey="parts.picker.change" onPress={() => setChosen(undefined)} />
              <NumberField testID="job-part-quantity" labelKey="jobs.parts.quantity" value={draft.quantity} min={0} step={1} onChange={(quantity) => setDraft({ ...draft, quantity })} {...(invalid === "quantity" ? { errorKey: "jobs.parts.quantityInvalid" } : {})} />
              <Button testID="job-part-submit" labelKey="jobs.parts.save" onPress={() => void submit()} />
            </>
          ) : null}
          {activeMode === "free" ? (
            <>
              <TextField testID="job-part-name" labelKey="jobs.parts.name" value={draft.name} onChangeText={(name) => setDraft({ ...draft, name })} {...(invalid === "name" ? { errorKey: "jobs.parts.nameRequired" } : {})} />
              <NumberField testID="job-part-quantity" labelKey="jobs.parts.quantity" value={draft.quantity} min={0} step={1} onChange={(quantity) => setDraft({ ...draft, quantity })} {...(invalid === "quantity" ? { errorKey: "jobs.parts.quantityInvalid" } : {})} />
              <TextField testID="job-part-unit" labelKey="jobs.parts.unit" value={draft.unit} onChangeText={(unit) => setDraft({ ...draft, unit })} {...(invalid === "unit" ? { errorKey: "jobs.parts.unitRequired" } : {})} />
              <TextField testID="job-part-cost" labelKey="jobs.parts.unitCost" hintKey="jobs.parts.unitCostHint" keyboardType="decimal-pad" value={draft.unitCost} onChangeText={(unitCost) => setDraft({ ...draft, unitCost })} {...(invalid === "unitCost" ? { errorKey: "jobs.parts.unitCostInvalid" } : {})} />
              <Button testID="job-part-submit" labelKey="jobs.parts.save" onPress={() => void submit()} />
            </>
          ) : null}
        </View>
      </BottomSheet>
      <PartStockSheet
        visible={stockSheet !== undefined}
        workOrderId={id}
        {...(stockSheet === "rejected" && rejected !== undefined ? { rejected: { name: rejected.name, quantity: rejected.quantity, unit: rejected.unit } } : {})}
        canHold={canHold}
        onFreeText={() => void onSheetFreeText()}
        onHold={() => void onSheetHold()}
        onClose={() => setStockSheet(undefined)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({ form: { gap: 12 } });
