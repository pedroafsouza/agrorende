"use client";

import { toast } from "sonner";

/** Success toast with an Undo action for reversible actions such as archive (REC-04). */
export function showUndoToast(message: string, undoLabel: string, onUndo: () => void): void {
  toast.success(message, { action: { label: undoLabel, onClick: onUndo }, duration: 8000 });
}
