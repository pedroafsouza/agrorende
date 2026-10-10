export interface HelpIndexItem {
  readonly code: string;
  readonly title: string;
  readonly href: string;
}

export interface HelpIndexGroup {
  readonly group: string;
  readonly items: readonly HelpIndexItem[];
}

/** Case- and accent-insensitive matching, so "sinal" finds "Sinal" and "first sync" finds "FIRST_SYNC_LARGE". */
export function normalizeQuery(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/[_-]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

export function matchesQuery(item: HelpIndexItem, query: string): boolean {
  const needle = normalizeQuery(query);
  if (needle.length === 0) return true;
  return normalizeQuery(`${item.code} ${item.title}`).includes(needle);
}
