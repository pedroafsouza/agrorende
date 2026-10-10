"use client";

import { useEffect, type RefObject } from "react";

/**
 * Shared behaviour for top-bar popovers (user menu, notifications): a click or tap outside the
 * root closes the panel, and Escape closes it and puts focus back on the trigger button.
 */
export function useDisclosure({
  open,
  setOpen,
  rootRef,
  buttonRef,
}: {
  readonly open: boolean;
  readonly setOpen: (open: boolean) => void;
  readonly rootRef: RefObject<HTMLElement | null>;
  readonly buttonRef: RefObject<HTMLElement | null>;
  readonly panelRef?: RefObject<HTMLElement | null>;
}): void {
  useEffect(() => {
    if (!open) return undefined;
    const outside = (event: PointerEvent | MouseEvent) => {
      if (rootRef.current !== null && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open, setOpen, rootRef, buttonRef]);
}
