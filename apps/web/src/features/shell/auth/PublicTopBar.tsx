"use client";

import { LanguageSwitch } from "../LanguageSwitch";
import { ThemeToggle } from "../ThemeToggle";

export function PublicTopBar() {
  return (
    <div className="flex justify-end gap-1 px-4 py-2">
      <LanguageSwitch persist={false} />
      <ThemeToggle />
    </div>
  );
}
