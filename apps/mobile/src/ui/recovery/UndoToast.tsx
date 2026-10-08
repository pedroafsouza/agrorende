import type { MessageKey, MessageValues } from "../../i18n/messages";
import { showToast } from "../Toast";

export interface UndoToastInput {
  readonly messageKey: MessageKey;
  readonly values?: MessageValues;
  readonly onUndo: () => void;
  readonly durationMs?: number;
}

/** Shows "Done · Undo" for reversible actions (REC-03); rendered by the root `ToastHost`. */
export function showUndoToast({ messageKey, values, onUndo, durationMs = 8000 }: UndoToastInput): number {
  return showToast({ messageKey, ...(values === undefined ? {} : { values }), tone: "success", durationMs, action: { labelKey: "ui.action.undo", onPress: onUndo } });
}

export { ToastHost as UndoToast } from "../Toast";
