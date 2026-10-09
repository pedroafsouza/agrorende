import { Gauge } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";

import { errorCodeOf } from "../../lib/errors";
import { Banner, BottomSheet, Button, ConfirmDialog, NumberField, showToast } from "../../ui";
import { InlineError } from "../../ui/recovery/InlineError";
import "./i18n";
import { checkCorrectedReading, type MeterJumpConflict, type ReadingCheck } from "./meterJump";

export type MeterJumpNamespace = "jobs" | "rentals";

export type MeterJumpDialogProps = {
  readonly ns: MeterJumpNamespace;
  readonly visible: boolean;
  readonly last: number | null;
  readonly next: number | null;
  readonly onConfirm: () => void;
  readonly onFix: () => void;
};

/** "This reading is much higher than the last one: last → new" with Confirm reading / Fix reading (EC-WO-14, EC-RN-26). */
export function MeterJumpDialog({ ns, visible, last, next, onConfirm, onFix }: MeterJumpDialogProps) {
  return (
    <ConfirmDialog
      visible={visible}
      titleKey={`${ns}.meterJump.title`}
      bodyKey={last === null || next === null ? `${ns}.meterJump.bodyUnknown` : `${ns}.meterJump.body`}
      bodyValues={{ last, next }}
      confirmLabelKey={`${ns}.meterJump.confirm`}
      cancelLabelKey={`${ns}.meterJump.fix`}
      onConfirm={onConfirm}
      onCancel={onFix}
    />
  );
}

export type MeterJumpResubmit = { readonly reading: number | null; readonly confirmJump: boolean };

export type MeterJumpReviewProps = {
  readonly ns: MeterJumpNamespace;
  readonly conflict: MeterJumpConflict;
  /** Queue the rejected command again, with the corrected reading and/or the jump confirmed. */
  readonly onResubmit: (input: MeterJumpResubmit) => Promise<void>;
  readonly testID?: string;
};

/**
 * Recovery for a reading the server rejected after sync: a warning banner that stays until the
 * user acts, the confirmation dialog (opened once by itself) and a sheet to correct the number.
 */
export function MeterJumpReview({ ns, conflict, onResubmit, testID = `${ns}-meter-jump` }: MeterJumpReviewProps) {
  const [stage, setStage] = useState<"idle" | "dialog" | "fix">("idle");
  const [reading, setReading] = useState<number | undefined>(conflict.next ?? undefined);
  const [pendingJump, setPendingJump] = useState<number | undefined>();
  const [check, setCheck] = useState<ReadingCheck | undefined>();
  const [errorKey, setErrorKey] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const opened = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (opened.current === conflict.conflictId) return;
    opened.current = conflict.conflictId;
    setReading(conflict.next ?? undefined);
    setPendingJump(undefined);
    setStage("dialog");
  }, [conflict.conflictId, conflict.next]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setErrorKey(undefined);
    try {
      await action();
      setStage("idle");
      showToast({ messageKey: `${ns}.meterJump.sent`, tone: "success" });
    } catch (err) {
      setErrorKey(`errors.${errorCodeOf(err)}.title`);
    } finally {
      setBusy(false);
    }
  };

  // A corrected reading that is still a big jump goes out with the confirmation as well.
  const confirm = () => {
    const corrected = pendingJump ?? conflict.next;
    setStage("idle");
    void run(() => onResubmit({ reading: corrected, confirmJump: true }));
  };

  const saveFix = () => {
    if (reading === undefined) return;
    const result = checkCorrectedReading(conflict, reading);
    setCheck(result);
    if (result === "lower") return;
    if (result === "jump") {
      setPendingJump(reading);
      setStage("dialog");
      return;
    }
    void run(() => onResubmit({ reading, confirmJump: false }));
  };

  const shownNext = pendingJump ?? conflict.next;

  return (
    <>
      <Banner
        testID={testID}
        tone="warning"
        titleKey={`${ns}.meterJump.rejectedTitle`}
        bodyKey={`${ns}.meterJump.rejectedBody`}
        action={{ labelKey: `${ns}.meterJump.review`, onPress: () => setStage("dialog") }}
      />
      {errorKey === undefined ? null : <InlineError testID={`${testID}-error`} messageKey={errorKey} />}
      <MeterJumpDialog
        ns={ns}
        visible={stage === "dialog"}
        last={conflict.last}
        next={shownNext}
        onConfirm={confirm}
        onFix={() => {
          setPendingJump(undefined);
          setCheck(undefined);
          setStage("fix");
        }}
      />
      <BottomSheet testID={`${testID}-fix`} visible={stage === "fix"} onClose={() => setStage("idle")} titleKey={`${ns}.meterJump.fixTitle`}>
        <NumberField
          testID={`${testID}-reading`}
          labelKey={`${ns}.meterJump.reading`}
          unitKey={`${ns}.meterJump.hours`}
          min={0}
          step={1}
          value={reading}
          onChange={(value) => {
            setReading(value);
            setCheck(undefined);
          }}
          {...(check === "lower" ? { errorKey: "errors.METER_READING_LOWER.title" } : {})}
        />
        {check === "lower" ? <InlineError testID={`${testID}-lower`} code="METER_READING_LOWER" /> : null}
        <Button testID={`${testID}-send`} icon={Gauge} labelKey={`${ns}.meterJump.send`} loading={busy} disabled={reading === undefined} onPress={saveFix} />
      </BottomSheet>
    </>
  );
}
