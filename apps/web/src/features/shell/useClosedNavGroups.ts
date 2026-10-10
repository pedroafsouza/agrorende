"use client";

import { useCallback, useEffect, useState } from "react";

import { NAV_GROUPS, type NavGroup } from "@/components/shell/nav";

export const NAV_GROUPS_CLOSED_KEY = "agrorende.sidebar.closedGroups";

function parse(raw: string | null): NavGroup[] {
  if (raw === null) return [];
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? NAV_GROUPS.filter((group) => value.includes(group)) : [];
  } catch {
    return [];
  }
}

/** Sidebar categories the user folded, remembered per browser. Every category starts open so server and client markup match. */
export function useClosedNavGroups(): readonly [ReadonlySet<NavGroup>, (group: NavGroup) => void] {
  const [closed, setClosed] = useState<ReadonlySet<NavGroup>>(() => new Set());

  useEffect(() => {
    try {
      setClosed(new Set(parse(window.localStorage.getItem(NAV_GROUPS_CLOSED_KEY))));
    } catch {
      // Storage can be blocked (private mode); every category then starts open.
    }
  }, []);

  const toggle = useCallback((group: NavGroup) => {
    setClosed((current) => {
      const next = new Set(current);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      try {
        window.localStorage.setItem(NAV_GROUPS_CLOSED_KEY, JSON.stringify([...next]));
      } catch {
        // Not persisted when storage is blocked; folding still works for this page.
      }
      return next;
    });
  }, []);

  return [closed, toggle] as const;
}
