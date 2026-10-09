"use client";

import { useEffect, useState, type ReactElement } from "react";

import { CommandPaletteDialog } from "./CommandPaletteDialog";

/** Window event that opens the palette; the shell search box and other triggers dispatch it through `openCommandPalette()`. */
export const OPEN_COMMAND_PALETTE_EVENT = "agrorende:command-palette";

export function openCommandPalette(): void {
  window.dispatchEvent(new Event(OPEN_COMMAND_PALETTE_EVENT));
}

/** `⌘K` / `Ctrl+K` and `/` shortcuts that open the palette, ignoring `/` while the user is typing in a field. */
export function isPaletteShortcut(
  event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "target">,
): boolean {
  if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey) && !event.altKey)
    return true;
  if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return false;
  const target = event.target;
  if (!(target instanceof HTMLElement)) return true;
  return !(target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
}

/**
 * Global command palette (T16.3, ARCHITECTURE §14.3): search across machines, field reports, work orders,
 * rentals, customers and farms, plus quick actions and page jumps. Renders nothing until opened.
 */
export function CommandPalette(): ReactElement | null {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!isPaletteShortcut(event)) return;
      event.preventDefault();
      setOpen((current) => !current || event.key === "/");
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpen);
    };
  }, []);

  if (!open) return null;
  return <CommandPaletteDialog onClose={() => setOpen(false)} />;
}
