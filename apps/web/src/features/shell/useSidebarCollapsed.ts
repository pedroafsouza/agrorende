"use client";

import { useCallback, useEffect, useState } from "react";

export const SIDEBAR_COLLAPSED_KEY = "agrorende.sidebar.collapsed";

/** Desktop sidebar rail state, remembered per browser. Starts expanded so server and client markup match. */
export function useSidebarCollapsed(): readonly [boolean, () => void] {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1");
    } catch {
      // Storage can be blocked (private mode); the sidebar then starts expanded.
    }
  }, []);

  const toggle = useCallback(() => {
    setCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        // Not persisted when storage is blocked; the toggle still works for this page.
      }
      return next;
    });
  }, []);

  return [collapsed, toggle] as const;
}
