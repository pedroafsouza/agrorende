import { readFileSync } from "node:fs";
import path from "node:path";

import { ERROR_META, type AppErrorCode } from "@agrorende/contracts/errors";
import { expect } from "vitest";

const I18N_ROOT = path.resolve(__dirname, "../../../src/i18n");

interface ErrorCopy {
  readonly title?: string;
  readonly body?: string;
  readonly action?: string;
}

const catalogs = new Map<string, Record<string, ErrorCopy>>();

function errorsFor(locale: "en" | "pt-BR"): Record<string, ErrorCopy> {
  let catalog = catalogs.get(locale);
  if (catalog === undefined) {
    catalog = JSON.parse(readFileSync(path.join(I18N_ROOT, locale, "errors.json"), "utf8")) as Record<string, ErrorCopy>;
    catalogs.set(locale, catalog);
  }
  return catalog;
}

/**
 * T12.13: a code a chaos scenario relies on must have `ERROR_META` with at least one recovery
 * pattern, and plain-language pt-BR and en `errors.<CODE>.title|body|action` copy.
 */
export function expectCatalog(code: AppErrorCode, entry?: string): void {
  const meta = ERROR_META[code];
  expect(meta, `ERROR_META.${code}`).toBeDefined();
  expect(meta.i18nKey).toBe(`errors.${code}`);
  expect(meta.recovery.length, `${code} recovery`).toBeGreaterThan(0);
  if (entry !== undefined) expect(meta.entries, `${code} entries`).toContain(entry);
  for (const locale of ["en", "pt-BR"] as const) {
    const copy = errorsFor(locale)[code];
    for (const field of ["title", "body", "action"] as const) {
      const text = copy?.[field];
      expect(text, `${locale} errors.${code}.${field}`).toBeTypeOf("string");
      expect((text ?? "").trim().length, `${locale} errors.${code}.${field}`).toBeGreaterThan(0);
      expect(text, `${locale} errors.${code}.${field} is not a raw key or code`).not.toMatch(/^errors\.|^[A-Z_]+$/);
    }
  }
}

/** Resolves to the `code` a promise rejects with (LocalError, AppError or transport error), or undefined. */
export async function localCode(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
  } catch (error) {
    return (error as { code?: string }).code;
  }
  return undefined;
}
