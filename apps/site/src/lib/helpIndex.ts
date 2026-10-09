import { ALL_ERROR_CODES, ERROR_META, type AppErrorCode } from "@agrorende/contracts/errors";

import { errorCopy } from "../i18n/messages";
import { type SiteLocale } from "./locales";
import { type HelpIndexGroup, type HelpIndexItem } from "./helpMatch";
import { helpErrorPath } from "./routes";

/** Groups in the order the help page lists them; the prefix is the EC domain from docs/ERRORS.md. */
export const HELP_GROUPS = ["PLT", "SYN", "FR", "WO", "RN", "OPS", "ERP", "SITE"] as const;
export type HelpGroup = (typeof HELP_GROUPS)[number];

function isHelpGroup(value: string): value is HelpGroup {
  return (HELP_GROUPS as readonly string[]).includes(value);
}

/** The first EC entry decides the group; every code in ERROR_META has at least one entry. */
export function groupOf(code: AppErrorCode): HelpGroup {
  const entry = ERROR_META[code].entries[0] ?? "";
  const prefix = /^EC-([A-Z]+)-/u.exec(entry)?.[1] ?? "";
  return isHelpGroup(prefix) ? prefix : "OPS";
}

export function buildHelpIndex(locale: SiteLocale): readonly HelpIndexGroup[] {
  const buckets = new Map<HelpGroup, HelpIndexItem[]>(HELP_GROUPS.map((group) => [group, []]));
  for (const code of [...ALL_ERROR_CODES].sort()) {
    const copy = errorCopy(locale, code);
    buckets.get(groupOf(code))?.push({
      code,
      title: copy?.title ?? code,
      href: helpErrorPath(code, locale),
    });
  }
  return HELP_GROUPS.map((group) => ({ group, items: buckets.get(group) ?? [] })).filter((g) => g.items.length > 0);
}
