"use client";

import { Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState, type InputHTMLAttributes, type ReactNode } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { cn } from "@/lib/cn";

/** The part of a `ListPage` the counter needs. `nextCursor` is optional because some lists are never paged. */
export interface CountedPage {
  readonly items: readonly unknown[];
  readonly nextCursor?: string | null;
}

export interface FilterBarProps {
  /** The free-text search (or entity picker). Always first; grows to fill the row and takes the full width on phones. */
  readonly search?: ReactNode;
  /** Select-like filters. Each one gets the same fixed width so a long selected value never resizes the row. */
  readonly selects?: ReactNode;
  /** Checkboxes and switches, after the selects. */
  readonly toggles?: ReactNode;
  /** True when any filter differs from its default. The clear button keeps its space either way. */
  readonly active: boolean;
  readonly onClear: () => void;
  /**
   * The list page as the API returned it; `undefined` while the first page loads. The counter reads
   * its row count, and "50+" when `nextCursor` says more pages exist. Use `count` instead for data that
   * is not a cursor page.
   */
  readonly page?: CountedPage | undefined;
  /** Rows shown, for lists that are not a cursor page; `undefined` while loading. Ignored when `page` is set. */
  readonly count?: number | undefined;
  /** More rows exist after these, so the counter reads "50+". Ignored when `page` is set. */
  readonly hasMore?: boolean;
  readonly showCount?: boolean;
  readonly className?: string;
}

/**
 * One filter toolbar for every admin list (FILTERS-ALIGN). Fixed order — search, selects, toggles,
 * then a right-aligned result count and "Clear filters" — and every control is 48 px high. Nothing
 * mounts or unmounts when filters change: the clear button only turns invisible, so the row never jumps.
 */
export function FilterBar({ search, selects, toggles, active, onClear, page, count: rawCount, hasMore: rawHasMore = false, showCount = true, className }: FilterBarProps) {
  const t = useTranslations("common");
  const count = page === undefined ? rawCount : page.items.length;
  const hasMore = page === undefined ? rawHasMore : (page.nextCursor ?? null) !== null;
  return (
    <div className={cn("ar-filterbar", className)} data-testid="filter-bar">
      {search === undefined ? null : <div className="ar-filterbar-search">{search}</div>}
      {selects === undefined ? null : <div className="ar-filterbar-selects">{selects}</div>}
      {toggles === undefined ? null : <div className="ar-filterbar-toggles">{toggles}</div>}
      <div className="ar-filterbar-end">
        {showCount ? (
          <p aria-live="polite" className={cn("ar-filterbar-count", count === undefined && "invisible")} data-testid="filter-bar-count">
            {count === undefined ? t("filters.results", { count: 0 }) : hasMore ? t("filters.resultsMore", { count }) : t("filters.results", { count })}
          </p>
        ) : null}
        <Button
          aria-hidden={active ? undefined : true}
          className={cn("ar-filterbar-clear", !active && "invisible")}
          data-testid="filter-bar-clear"
          icon={<X aria-hidden="true" className="size-4" />}
          onClick={onClear}
          tabIndex={active ? undefined : -1}
          variant="ghost"
        >
          {t("filters.clear")}
        </Button>
      </div>
    </div>
  );
}

export interface FilterSearchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "defaultValue" | "onChange" | "type"> {
  /** The search as stored in the URL. */
  readonly value: string;
  /** Called with the trimmed search once the person stops typing, presses Enter or leaves the box; `null` when it is empty. */
  readonly onSearch: (value: string | null) => void;
  readonly delayMs?: number;
}

interface PendingSearch {
  readonly id: ReturnType<typeof setTimeout>;
  readonly text: string;
}

/**
 * Search box with a leading icon. It keeps what the person types locally and writes it to the URL
 * after a short pause, so the list refetches once per word instead of once per key. Enter and blur
 * send the pending search at once. Unmounting drops it instead, because writing the URL of a page the
 * person is leaving would pull them back to it.
 */
export function FilterSearch({ value, onSearch, delayMs = 300, className, onBlur, onKeyDown, ...rest }: FilterSearchProps) {
  const [text, setText] = useState(value);
  const onSearchRef = useRef(onSearch);
  /** The search last sent or adopted from the URL; typing that trims to it sends nothing. */
  const baseline = useRef(value);
  /** Searches sent but not yet seen back in `value`, oldest first. */
  const echoes = useRef<string[]>([]);
  const pending = useRef<PendingSearch | null>(null);

  useEffect(() => {
    onSearchRef.current = onSearch;
  }, [onSearch]);

  const cancel = useCallback(() => {
    if (pending.current === null) return;
    clearTimeout(pending.current.id);
    pending.current = null;
  }, []);

  const emit = useCallback((raw: string) => {
    const next = raw.trim();
    if (next === baseline.current) return;
    baseline.current = next;
    echoes.current.push(next);
    onSearchRef.current(next.length === 0 ? null : next);
  }, []);

  const flush = useCallback(() => {
    const current = pending.current;
    if (current === null) return;
    cancel();
    emit(current.text);
  }, [cancel, emit]);

  // `value` changed. Our own echo (even of an older search) never overwrites newer typing; anything
  // else came from outside (clear filters, back button), so it wins over what is pending.
  useEffect(() => {
    const echo = echoes.current.indexOf(value);
    if (echo >= 0) {
      echoes.current.splice(0, echo + 1);
      return;
    }
    if (value === baseline.current) return;
    cancel();
    echoes.current = [];
    baseline.current = value;
    setText(value);
  }, [value, cancel]);

  useEffect(() => cancel, [cancel]);

  const change = (next: string) => {
    setText(next);
    cancel();
    const id = setTimeout(() => {
      pending.current = null;
      emit(next);
    }, delayMs);
    pending.current = { id, text: next };
  };

  return (
    <div className="relative">
      <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-[var(--ar-text-muted)]" />
      <Input
        {...rest}
        className={cn("pl-10", className)}
        onBlur={(e) => {
          flush();
          onBlur?.(e);
        }}
        onChange={(e) => change(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") flush();
          onKeyDown?.(e);
        }}
        type="search"
        value={text}
      />
    </div>
  );
}
