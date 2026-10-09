import { PauseCircle, PenLine } from "lucide-react-native";

import { BottomSheet, Button, Text } from "../../../ui";
import { AskOfficeButton } from "../../../ui/recovery/AskOfficeButton";
import { useRecovery } from "../../../ui/recovery/useRecovery";

export type PartStockSheetProps = {
  readonly visible: boolean;
  readonly workOrderId: string;
  /** Present when the server refused a line after sync; absent for the device-side check. */
  readonly rejected?: { readonly name: string; readonly quantity: number; readonly unit: string };
  readonly canHold: boolean;
  readonly onFreeText: () => void;
  readonly onHold: () => void;
  readonly onClose: () => void;
};

/**
 * EC-WO-20 `WO_PART_NOT_IN_VAN_STOCK`: the part typed so far is kept; the technician saves it
 * as free text, puts the job on hold waiting for parts, or asks the office for a transfer.
 */
export function PartStockSheet({ visible, workOrderId, rejected, canHold, onFreeText, onHold, onClose }: PartStockSheetProps) {
  const recovery = useRecovery("WO_PART_NOT_IN_VAN_STOCK", {}, { entityType: "WORK_ORDER", entityId: workOrderId });
  return (
    <BottomSheet testID="part-stock-sheet" visible={visible} onClose={onClose} titleKey={recovery.titleKey}>
      <Text i18nKey={recovery.bodyKey} />
      {rejected === undefined ? (
        <Text variant="caption" i18nKey="parts.stock.keptDraft" />
      ) : (
        <Text testID="part-stock-rejected" variant="caption" i18nKey="parts.stock.rejectedBody" values={{ name: rejected.name, quantity: rejected.quantity, unit: rejected.unit }} />
      )}
      <Button
        testID="part-stock-free-text"
        icon={PenLine}
        labelKey="parts.stock.useFreeText"
        onPress={() => {
          onFreeText();
          onClose();
        }}
      />
      {canHold ? (
        <Button
          testID="part-stock-hold"
          variant="secondary"
          icon={PauseCircle}
          labelKey="parts.stock.holdWaitingParts"
          onPress={() => {
            onHold();
            onClose();
          }}
        />
      ) : null}
      <AskOfficeButton code={recovery.code} entityType="WORK_ORDER" entityId={workOrderId} />
      <Button testID="part-stock-close" variant="ghost" labelKey="ui.action.close" onPress={onClose} />
    </BottomSheet>
  );
}
