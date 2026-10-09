import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CLIENT_ERROR_CODES,
  ERROR_CODES,
  ERROR_HTTP_STATUS,
  ERROR_META,
  RECOVERY_PATTERNS,
  type AppErrorCode,
  type ErrorMeta,
} from "@agrorende/contracts/errors";
import { helpUrl } from "@agrorende/i18n/helpUrl";
import { REQUIRED_LOCALES } from "@agrorende/i18n/locales";
import { describe, expect, it } from "vitest";

/**
 * T10.11 / T10.12 catalog integrity suite. docs/ERRORS.md §12 (code index) and §13 (coverage by
 * task) are compared with `ERROR_META` and with the `errors` namespace of every locale file set.
 */

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const ERRORS_MD = readFileSync(resolve(REPO_ROOT, "docs/ERRORS.md"), "utf8");

type IndexRow = {
  code: string;
  kind: "server" | "client";
  http: number | undefined;
  retryable: boolean;
  surface: string;
  recovery: string[];
  entries: string[];
};

type EcEntry = {
  id: string;
  fields: Map<string, string>;
};

type JsonObject = { [key: string]: unknown };

function section(markdown: string, heading: RegExp): string {
  const lines = markdown.split("\n");
  const start = lines.findIndex((line) => heading.test(line));
  if (start < 0) {
    throw new Error(`Section ${heading.source} not found in docs/ERRORS.md`);
  }
  const end = lines.findIndex((line, index) => index > start && /^## /.test(line));
  return lines.slice(start + 1, end < 0 ? undefined : end).join("\n");
}

function tableRows(block: string): string[][] {
  return block
    .split("\n")
    .filter((line) => line.startsWith("|"))
    .slice(2)
    .map((line) =>
      line
        .slice(1, line.endsWith("|") ? -1 : undefined)
        .split(/(?<!\\)\|/)
        .map((cell) => cell.trim()),
    );
}

function backticked(cell: string): string[] {
  return [...cell.matchAll(/`([^`]+)`/g)].map((match) => match[1] ?? "");
}

/** Codes named as `CODE` (server|client …) or `A` / `B` (server …) in a Detected by line. */
function detectedCodes(entry: EcEntry): string[] {
  const line = entry.fields.get("Detected by") ?? "";
  return [...line.matchAll(/`([A-Z][A-Z0-9_]+)`(?=(?:\s*\/\s*`[A-Z0-9_]+`)*\s*\((?:server|client))/g)].map(
    (match) => match[1] ?? "",
  );
}

/** Recovery pattern tokens are the bare upper-case words; contexts, headers and field codes are ignored. */
function recoveryPatterns(entry: EcEntry): string[] {
  return backticked(entry.fields.get("Recovery") ?? "").filter((token) => /^[A-Z]+$/.test(token));
}

function parseCodeIndex(): IndexRow[] {
  return tableRows(section(ERRORS_MD, /^## \d+\. Code index/)).map((cells) => {
    const [code = "", kind = "", http = "", retryable = "", surface = "", recovery = "", entries = ""] = cells;
    return {
      code: backticked(code)[0] ?? code,
      kind: kind.startsWith("server") ? "server" : "client",
      http: /^\d+$/.test(http) ? Number(http) : undefined,
      retryable: retryable === "yes",
      surface,
      recovery: backticked(recovery),
      entries: entries
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0),
    };
  });
}

function parseEcEntries(): EcEntry[] {
  const entries: EcEntry[] = [];
  let current: EcEntry | undefined;
  for (const line of ERRORS_MD.split("\n")) {
    const heading = /^#### (EC-[A-Z]+-\d+) · .+$/.exec(line);
    if (heading) {
      current = { id: heading[1] ?? "", fields: new Map() };
      entries.push(current);
      continue;
    }
    if (/^#{1,3} /.test(line)) {
      current = undefined;
      continue;
    }
    const field = /^- \*\*([^*]+):\*\*\s*(.*)$/.exec(line);
    if (current && field) {
      current.fields.set(field[1] ?? "", (field[2] ?? "").trim());
    }
  }
  return entries;
}

/** Expands `EC-PLT-01–43` style ranges used by §13. */
function expandEcRefs(cell: string): string[] {
  const ids: string[] = [];
  for (const match of cell.matchAll(/EC-([A-Z]+)-(\d+)(?:[–-](\d+))?/g)) {
    const area = match[1] ?? "";
    const from = Number(match[2]);
    const to = match[3] === undefined ? from : Number(match[3]);
    for (let n = from; n <= to; n += 1) {
      ids.push(`EC-${area}-${String(n).padStart(2, "0")}`);
    }
  }
  return ids;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function readErrorsNamespace(relativePath: string): JsonObject {
  const absolute = resolve(REPO_ROOT, relativePath);
  if (!existsSync(absolute)) {
    throw new Error(`Missing locale file ${relativePath}`);
  }
  const parsed: unknown = JSON.parse(readFileSync(absolute, "utf8"));
  if (!isObject(parsed)) {
    throw new Error(`${relativePath} is not a JSON object`);
  }
  return parsed;
}

function missingCopy(namespace: JsonObject, codes: readonly string[]): string[] {
  const missing: string[] = [];
  for (const code of codes) {
    const entry = namespace[code];
    for (const part of ["title", "body", "action"] as const) {
      if (!isObject(entry) || !nonEmptyString(entry[part])) {
        missing.push(`errors.${code}.${part}`);
      }
    }
    if (isObject(entry) && "help" in entry && !nonEmptyString(entry.help)) {
      missing.push(`errors.${code}.help (declared but empty)`);
    }
  }
  return missing;
}

const META: Readonly<Record<string, ErrorMeta>> = ERROR_META;
const SERVER_CODES: readonly string[] = ERROR_CODES;
const CLIENT_CODES: readonly string[] = CLIENT_ERROR_CODES;
const ALL_CODES: readonly AppErrorCode[] = [...ERROR_CODES, ...CLIENT_ERROR_CODES];
const HTTP: Readonly<Record<string, number>> = ERROR_HTTP_STATUS;
const RECOVERY: ReadonlySet<string> = new Set(RECOVERY_PATTERNS);

const index = parseCodeIndex();
const indexByCode = new Map(index.map((row) => [row.code, row]));
const ecEntries = parseEcEntries();
const ecIds = new Set(ecEntries.map((entry) => entry.id));

const I18N_SETS: readonly { name: string; path: (locale: string) => string; scope: string; codes: readonly string[] }[] = [
  { name: "packages/i18n", path: (locale) => `packages/i18n/locales/${locale}/errors.json`, scope: "all", codes: ALL_CODES },
  { name: "apps/mobile", path: (locale) => `apps/mobile/src/i18n/${locale}/errors.json`, scope: "all", codes: ALL_CODES },
  { name: "apps/web", path: (locale) => `apps/web/messages/${locale}/errors.json`, scope: "server", codes: ERROR_CODES },
];

describe("docs/ERRORS.md structure", () => {
  it("parses a non-empty code index and EC entry list", () => {
    expect(index.length).toBeGreaterThan(0);
    expect(ecEntries.length).toBeGreaterThan(0);
  });

  it("has no duplicate codes in the code index and no duplicate EC ids", () => {
    const codes = index.map((row) => row.code);
    expect(codes.filter((code, i) => codes.indexOf(code) !== i)).toEqual([]);
    const ids = ecEntries.map((entry) => entry.id);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
  });

  it("matches the counts declared in the header and in §13", () => {
    const header = /\| EC entries \| (\d+) \|/.exec(ERRORS_MD);
    const counts = /\| Code counts \| (\d+) server \/ (\d+) client \/ (\d+) total \|/.exec(ERRORS_MD);
    const summary = /Summary: (\d+) EC entries cover (\d+) codes \(target split: (\d+) server \/ (\d+) client\)/.exec(
      ERRORS_MD,
    );
    const server = index.filter((row) => row.kind === "server").length;
    const client = index.filter((row) => row.kind === "client").length;
    expect(Number(header?.[1])).toBe(ecEntries.length);
    expect([Number(counts?.[1]), Number(counts?.[2]), Number(counts?.[3])]).toEqual([server, client, index.length]);
    expect(summary?.slice(1).map(Number)).toEqual([ecEntries.length, index.length, server, client]);
  });

  it("references only existing EC entries from the code index", () => {
    const dangling = index.flatMap((row) => row.entries.filter((id) => !ecIds.has(id)).map((id) => `${row.code} → ${id}`));
    expect(dangling).toEqual([]);
  });

  it("references only existing EC entries from §13 coverage by task", () => {
    const rows = tableRows(section(ERRORS_MD, /^## \d+\. Coverage by task/));
    const dangling = rows.flatMap(([task = "", entries = ""]) =>
      expandEcRefs(entries)
        .filter((id) => !ecIds.has(id))
        .map((id) => `${task} → ${id}`),
    );
    expect(dangling).toEqual([]);
  });

  it("only names catalogued codes in the Detected by line of every EC entry", () => {
    const unknown = ecEntries.flatMap((entry) =>
      detectedCodes(entry)
        .filter((code) => !indexByCode.has(code))
        .map((code) => `${entry.id} → ${code}`),
    );
    expect(unknown).toEqual([]);
  });

  it("names at least one code in every EC entry and indexes every EC entry", () => {
    const indexed = new Set(index.flatMap((row) => row.entries));
    const orphans = ecEntries
      .filter((entry) => detectedCodes(entry).length === 0 || !indexed.has(entry.id))
      .map((entry) => entry.id);
    expect(orphans).toEqual([]);
  });

  it("lists every EC entry under the codes it is detected by", () => {
    const unlisted = ecEntries.flatMap((entry) =>
      detectedCodes(entry)
        .filter((code) => indexByCode.has(code) && !(indexByCode.get(code)?.entries ?? []).includes(entry.id))
        .map((code) => `${code} misses ${entry.id}`),
    );
    expect(unlisted).toEqual([]);
  });

  it("declares a valid recovery and a test for every task-owned EC entry", () => {
    const problems = ecEntries.flatMap((entry) => {
      const owner = entry.fields.get("Priority / owner") ?? "";
      if (!/\bT\d{2}\b/.test(owner)) {
        return [];
      }
      const found: string[] = [];
      if (!nonEmptyString(entry.fields.get("Test"))) {
        found.push(`${entry.id}: no Test`);
      }
      const recovery = recoveryPatterns(entry);
      if (recovery.length === 0 || recovery.some((pattern) => !RECOVERY.has(pattern))) {
        found.push(`${entry.id}: invalid Recovery ${JSON.stringify(recovery)}`);
      }
      return found;
    });
    expect(problems).toEqual([]);
  });
});

describe("code index ↔ ERROR_META", () => {
  it("catalogues every ERROR_META code (no unused code in contracts)", () => {
    expect(Object.keys(META).filter((code) => !indexByCode.has(code))).toEqual([]);
  });

  it("defines ERROR_META for every catalogued code (no missing code in contracts)", () => {
    expect(index.map((row) => row.code).filter((code) => !(code in META))).toEqual([]);
  });

  it("keeps ERROR_CODES and CLIENT_ERROR_CODES disjoint and equal to the ERROR_META keys", () => {
    expect([...SERVER_CODES, ...CLIENT_CODES].sort()).toEqual(Object.keys(META).sort());
    expect(SERVER_CODES.filter((code) => CLIENT_CODES.includes(code))).toEqual([]);
  });

  it("agrees on server/client kind for every code", () => {
    const mismatched = index.flatMap((row) => {
      const meta = META[row.code];
      if (!meta) {
        return [];
      }
      const listKind = SERVER_CODES.includes(row.code) ? "server" : CLIENT_CODES.includes(row.code) ? "client" : "none";
      return meta.kind === row.kind && listKind === row.kind
        ? []
        : [`${row.code}: index ${row.kind}, meta ${meta.kind}, list ${listKind}`];
    });
    expect(mismatched).toEqual([]);
  });

  it("agrees on HTTP status, retryable, surface, recovery, entries and i18n key", () => {
    const mismatched = index.flatMap((row) => {
      const meta = META[row.code];
      if (!meta) {
        return [];
      }
      const problems: string[] = [];
      if (row.kind === "server") {
        if (row.http === undefined || meta.http !== row.http || HTTP[row.code] !== row.http) {
          problems.push(`http index=${String(row.http)} meta=${String(meta.http)} map=${String(HTTP[row.code])}`);
        }
      } else if (meta.http !== undefined || row.http !== undefined) {
        problems.push("client code declares an HTTP status");
      }
      if (meta.retryable !== row.retryable) problems.push(`retryable index=${row.retryable} meta=${meta.retryable}`);
      if (meta.surface !== row.surface) problems.push(`surface index="${row.surface}" meta="${meta.surface}"`);
      if (meta.recovery.join(",") !== row.recovery.join(",")) {
        problems.push(`recovery index=${row.recovery.join(",")} meta=${meta.recovery.join(",")}`);
      }
      if (meta.entries.join(",") !== row.entries.join(",")) {
        problems.push(`entries index=${row.entries.join(",")} meta=${meta.entries.join(",")}`);
      }
      if (meta.i18nKey !== `errors.${row.code}`) problems.push(`i18nKey ${meta.i18nKey}`);
      return problems.map((problem) => `${row.code}: ${problem}`);
    });
    expect(mismatched).toEqual([]);
  });

  it("declares at least one valid recovery pattern for every code", () => {
    const invalid = Object.entries(META).flatMap(([code, meta]) =>
      meta.recovery.length > 0 && meta.recovery.every((pattern) => RECOVERY.has(pattern))
        ? []
        : [`${code}: ${meta.recovery.join(",")}`],
    );
    expect(invalid).toEqual([]);
  });
});

describe("errors.<CODE> copy in every required locale", () => {
  for (const set of I18N_SETS) {
    for (const locale of REQUIRED_LOCALES) {
      it(`${set.name} ${locale} has title, body and action for ${set.scope} codes`, () => {
        expect(missingCopy(readErrorsNamespace(set.path(locale)), set.codes)).toEqual([]);
      });
    }

    it(`${set.name} declares optional help copy in every locale or in none`, () => {
      const namespaces = REQUIRED_LOCALES.map((locale) => readErrorsNamespace(set.path(locale)));
      const uneven = set.codes.filter((code) => {
        const declared = namespaces.map((namespace) => {
          const entry = namespace[code];
          return isObject(entry) && "help" in entry;
        });
        return declared.some(Boolean) && !declared.every(Boolean);
      });
      expect(uneven).toEqual([]);
    });
  }

  it("translates every title, body and action instead of copying the pt-BR reference", () => {
    const copied = I18N_SETS.flatMap((set) => {
      const reference = readErrorsNamespace(set.path("pt-BR"));
      return REQUIRED_LOCALES.filter((locale) => locale !== "pt-BR").flatMap((locale) => {
        const namespace = readErrorsNamespace(set.path(locale));
        return set.codes.flatMap((code) =>
          (["title", "body", "action"] as const)
            .filter((part) => {
              const entry = namespace[code];
              const ref = reference[code];
              return isObject(entry) && isObject(ref) && nonEmptyString(entry[part]) && entry[part] === ref[part];
            })
            .map((part) => `${set.name} ${locale} errors.${code}.${part}`),
        );
      });
    });
    expect(copied).toEqual([]);
  });

  it("completes every ERROR_META context variant in every locale once any locale declares it", () => {
    const missing = I18N_SETS.flatMap((set) => {
      const namespaces = REQUIRED_LOCALES.map((locale) => ({ locale, namespace: readErrorsNamespace(set.path(locale)) }));
      return set.codes.flatMap((code) =>
        (META[code]?.contexts ?? []).flatMap((context) => {
          const variants = namespaces.map(({ locale, namespace }) => {
            const entry = namespace[code];
            return { locale, variant: isObject(entry) ? entry[context] : undefined };
          });
          if (variants.every(({ variant }) => variant === undefined)) {
            return [];
          }
          return variants.flatMap(({ locale, variant }) =>
            (["title", "body", "action"] as const)
              .filter((part) => !isObject(variant) || !nonEmptyString(variant[part]))
              .map((part) => `${set.name} ${locale} errors.${code}.${context}.${part}`),
          );
        }),
      );
    });
    expect(missing).toEqual([]);
  });
});

describe("helpUrl(code, locale)", () => {
  const expectedPrefix: Record<string, string> = { "pt-BR": "/pt-br/ajuda/erros/", en: "/en/help/errors/" };

  it("returns a well-formed, unique help path for every code and required locale", () => {
    const broken: string[] = [];
    for (const locale of REQUIRED_LOCALES) {
      const seen = new Set<string>();
      for (const code of ALL_CODES) {
        const url = helpUrl(code, locale);
        const expected = `${expectedPrefix[locale] ?? ""}${code.toLowerCase().replace(/_/g, "-")}`;
        if (url !== expected || !/^\/[a-z-]+(\/[a-z0-9-]+)+$/.test(url) || seen.has(url)) {
          broken.push(`${locale} ${code} → ${url}`);
        }
        seen.add(url);
      }
    }
    expect(broken).toEqual([]);
  });

  it("matches the help path pattern documented in docs/ERRORS.md §1", () => {
    expect(ERRORS_MD).toContain("`/pt-br/ajuda/erros/<code-kebab>`");
    expect(ERRORS_MD).toContain("`/en/help/errors/<code-kebab>`");
  });
});
