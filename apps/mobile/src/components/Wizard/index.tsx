import { ArrowLeft, ArrowRight, Check } from "lucide-react-native";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import type { DraftKind } from "../../db/schema";
import type { SqlDb } from "../../db/sql";
import type { MessageKey } from "../../i18n/messages";
import { errorCodeOf } from "../../lib/errors";
import { useServices } from "../../lib/services";
import { Button, Screen, Text, hapticSuccess, useTheme } from "../../ui";
import { InlineError } from "../../ui/recovery/InlineError";
import { useWizardDraft, type WizardDraftState } from "./useWizardDraft";

export { useWizardDraft, WIZARD_AUTOSAVE_MS } from "./useWizardDraft";

/** `true` = valid; `false` = invalid with the generic reason; a key = invalid with that inline reason. */
export type WizardValidation = boolean | MessageKey;

export type WizardStep<P = Record<string, unknown>> = {
  readonly id: string;
  readonly titleKey?: MessageKey;
  readonly content?: ReactNode;
  readonly render?: (wizard: WizardContextValue<P>) => ReactNode;
  readonly validate?: (payload: P) => Promise<WizardValidation> | WizardValidation;
};

export type WizardContextValue<P> = WizardDraftState<P> & { readonly stepIndex: number; readonly goTo: (stepId: string) => void };

const WizardContext = createContext<WizardContextValue<object> | undefined>(undefined);

/** Step content reads and edits the wizard payload through this hook. */
export function useWizard<P extends object>(): WizardContextValue<P> {
  const value = useContext(WizardContext);
  if (value === undefined) throw new Error("useWizard must be used inside <Wizard>");
  return value as unknown as WizardContextValue<P>;
}

export type WizardProps<P extends object = Record<string, unknown>> = {
  readonly draftId?: string;
  readonly kind?: DraftKind;
  readonly refId?: string;
  readonly initialPayload?: P;
  readonly steps: readonly WizardStep<P>[];
  readonly onSubmit: (payload: P) => Promise<void>;
  readonly submitLabelKey?: MessageKey;
  readonly onCancel?: () => void;
  readonly db?: SqlDb;
  readonly autosaveMs?: number;
  readonly testID?: string;
};

/** Multi-step flow: "2 de 4" header, one primary action, autosave + resume, inline validation reasons. */
export function Wizard<P extends object = Record<string, unknown>>({
  draftId,
  kind = "FIELD_REPORT",
  refId,
  initialPayload,
  steps,
  onSubmit,
  submitLabelKey = "ui.wizard.submit",
  onCancel,
  db,
  autosaveMs,
  testID = "wizard",
}: WizardProps<P>) {
  const services = useServices();
  const theme = useTheme();
  const [fallbackId] = useState(() => draftId ?? services.newId?.() ?? `draft-${Date.now()}`);
  const draft = useWizardDraft<P>({
    db: db ?? services.db,
    draftId: draftId ?? fallbackId,
    kind,
    ...(refId === undefined ? {} : { refId }),
    initialPayload: initialPayload ?? ({} as P),
    ...(autosaveMs === undefined ? {} : { autosaveMs }),
  });
  const index = Math.max(0, steps.findIndex((s) => s.id === draft.stepId));
  const step = steps[index];
  const last = index === steps.length - 1;
  const [reason, setReason] = useState<MessageKey | undefined>();
  const [valid, setValid] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | undefined>();

  useEffect(() => {
    let active = true;
    const run = async () => {
      const result = step?.validate === undefined ? true : await step.validate(draft.payload);
      if (!active) return;
      setValid(result === true);
      setReason(result === true ? undefined : result === false ? "ui.wizard.incomplete" : result);
    };
    run().catch(() => {
      if (active) {
        setValid(false);
        setReason("ui.wizard.incomplete");
      }
    });
    return () => {
      active = false;
    };
  }, [step, draft.payload]);

  const context = useMemo<WizardContextValue<P>>(() => ({ ...draft, stepIndex: index, goTo: draft.setStepId }), [draft, index]);

  if (!draft.hydrated || step === undefined) return <Screen testID={`${testID}-loading`} />;

  const next = async () => {
    if (!valid) return;
    if (!last) {
      const target = steps[index + 1];
      if (target !== undefined) draft.setStepId(target.id);
      return;
    }
    setSubmitting(true);
    setSubmitError(undefined);
    try {
      await draft.flush();
      await onSubmit(draft.payload);
      await draft.discard();
      hapticSuccess();
    } catch (error) {
      setSubmitError(errorCodeOf(error));
    } finally {
      setSubmitting(false);
    }
  };

  const back = () => {
    const target = steps[index - 1];
    if (target !== undefined) draft.setStepId(target.id);
    else onCancel?.();
  };

  return (
    <WizardContext.Provider value={context as unknown as WizardContextValue<object>}>
      <Screen
        testID={testID}
        footer={
          <View style={styles.footer}>
            {!valid && reason !== undefined ? <InlineError testID={`${testID}-reason`} messageKey={reason} /> : null}
            {submitError === undefined ? null : <InlineError testID={`${testID}-submit-error`} code={submitError} />}
            <View style={styles.row}>
              {index > 0 || onCancel !== undefined ? (
                <View style={styles.back}>
                  <Button testID={`${testID}-back`} variant="secondary" icon={ArrowLeft} labelKey={index > 0 ? "ui.wizard.back" : "ui.action.cancel"} onPress={back} />
                </View>
              ) : null}
              <View style={styles.next}>
                <Button
                  testID={`${testID}-next`}
                  icon={last ? Check : ArrowRight}
                  labelKey={last ? submitLabelKey : "ui.wizard.next"}
                  disabled={!valid}
                  loading={submitting}
                  onPress={() => {
                    next().catch(() => undefined);
                  }}
                />
              </View>
            </View>
          </View>
        }
      >
        <View style={styles.header}>
          <Text testID={`${testID}-progress`} i18nKey="ui.wizard.progress" values={{ current: index + 1, total: steps.length }} tone="secondary" variant="label" />
          <View style={[styles.track, { backgroundColor: theme.border }]}>
            <View style={[styles.fill, { backgroundColor: theme.primary, width: `${((index + 1) / steps.length) * 100}%` }]} />
          </View>
          {step.titleKey === undefined ? null : <Text i18nKey={step.titleKey} variant="title" accessibilityRole="header" />}
        </View>
        {step.render === undefined ? step.content : step.render(context)}
      </Screen>
    </WizardContext.Provider>
  );
}

const styles = StyleSheet.create({
  back: { flex: 1 },
  fill: { borderRadius: 3, height: 6 },
  footer: { gap: 8 },
  header: { gap: 8 },
  next: { flex: 2 },
  row: { flexDirection: "row", gap: 12 },
  track: { borderRadius: 3, height: 6, overflow: "hidden" },
});
