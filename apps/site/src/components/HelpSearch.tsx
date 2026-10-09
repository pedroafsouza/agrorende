"use client";

import { Search } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";

import { normalizeQuery } from "@/lib/helpMatch";

export interface HelpSearchLabels {
  readonly searchLabel: string;
  readonly searchPlaceholder: string;
  readonly searchEmpty: string;
  /** "{count} codes" rendered on the server for one item, because ICU plurals stay on the server. */
  readonly countOne: string;
  /** The plural form with a literal `{count}` placeholder that the browser fills in. */
  readonly countOther: string;
}

/** `[code, title]`, kept as a tuple so the index stays small in the inlined React payload. */
export type HelpSearchItem = readonly [code: string, title: string];
/** `[group id, group label, items]`. */
export type HelpSearchGroup = readonly [group: string, label: string, items: readonly HelpSearchItem[]];

/** Mirrors `codeToSlug` in `@/lib/routes` without bundling the code list; a unit test keeps the two in step. */
export function helpCodeHref(base: string, code: string): string {
  return `${base}${code.toLowerCase().replace(/_/gu, "-")}/`;
}

function filterGroups(groups: readonly HelpSearchGroup[], query: string): readonly HelpSearchGroup[] {
  const needle = normalizeQuery(query);
  if (needle.length === 0) return groups;
  return groups
    .map(([group, label, items]): HelpSearchGroup => [group, label, items.filter(([code, title]) => normalizeQuery(`${code} ${title}`).includes(needle))])
    .filter(([, , items]) => items.length > 0);
}

/**
 * Filters the error-code index in the browser. Without JavaScript the full grouped list is
 * already in the HTML and the search field stays hidden, so nothing is lost (EC-SITE-05).
 */
export function HelpSearch({
  groups,
  hrefBase,
  labels,
}: {
  readonly groups: readonly HelpSearchGroup[];
  readonly hrefBase: string;
  readonly labels: HelpSearchLabels;
}) {
  const id = useId();
  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("q");
    if (q !== null) setQuery(q.slice(0, 80));
    setReady(true);
  }, []);

  const filtered = useMemo(() => filterGroups(groups, query), [groups, query]);
  const total = filtered.reduce((sum, [, , items]) => sum + items.length, 0);
  const status = total === 0 ? labels.searchEmpty : total === 1 ? labels.countOne : labels.countOther.replace("{count}", String(total));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2" hidden={!ready}>
        <label htmlFor={id} className="font-semibold">
          {labels.searchLabel}
        </label>
        <div className="relative max-w-xl">
          <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-fg-muted" />
          <input
            id={id}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={labels.searchPlaceholder}
            autoComplete="off"
            spellCheck={false}
            className="min-h-12 w-full rounded-[8px] border-2 border-border bg-bg py-2 pr-3 pl-11 text-base text-fg placeholder:text-fg-muted focus:border-fg"
            data-help-search-input="true"
          />
        </div>
        <p role="status" aria-live="polite" className="text-sm text-fg-muted">
          {status}
        </p>
      </div>
      {filtered.map(([group, label, items]) => (
        <section key={group} aria-labelledby={`${id}-${group}`} className="flex flex-col gap-2">
          <h3 id={`${id}-${group}`} className="text-lg font-bold">
            {label}
          </h3>
          <ul className="code-list">
            {items.map(([code, title]) => (
              <li key={code}>
                <a href={helpCodeHref(hrefBase, code)} data-code={code}>
                  <b>{title}</b>
                  <code>{code}</code>
                </a>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
