"use client";

import { useEffect } from "react";

/** Warns before the tab closes or reloads while a form has unsaved edits (REC-02). */
export function UnsavedChangesGuard({ when }: { readonly when: boolean }) {
  useEffect(() => {
    if (!when) return undefined;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [when]);
  return null;
}
