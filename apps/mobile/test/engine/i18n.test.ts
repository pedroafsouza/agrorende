import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { ALL_ERROR_CODES } from "@agrorende/contracts/errors";
import { AssetConditionEnum, MediaKindEnum, MediaTagEnum } from "@agrorende/contracts";
import { MutationNameEnum } from "@agrorende/contracts/sync";

const root = join(__dirname, "..", "..");
const i18nDir = join(root, "src", "i18n");
const LOCALES = ["pt-BR", "en"] as const;
type Tree = { readonly [key: string]: string | Tree };

function flatten(tree: Tree, prefix = "", out = new Map<string, string>()): Map<string, string> {
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix.length === 0 ? key : `${prefix}.${key}`;
    if (typeof value === "string") out.set(path, value);
    else flatten(value, path, out);
  }
  return out;
}

const namespaces = readdirSync(join(i18nDir, "pt-BR")).map((file) => file.replace(/\.json$/, ""));
const bundles = Object.fromEntries(
  LOCALES.map((locale) => [locale, Object.fromEntries(namespaces.map((ns) => [ns, flatten(JSON.parse(readFileSync(join(i18nDir, locale, `${ns}.json`), "utf8")) as Tree)]))]),
) as Record<(typeof LOCALES)[number], Record<string, Map<string, string>>>;

/** Mirrors `splitKey` in `src/i18n/runtime.ts`: unknown first segments resolve in `common`. */
function lookup(locale: (typeof LOCALES)[number], key: string): string | undefined {
  const dot = key.indexOf(".");
  const head = key.slice(0, dot);
  if (dot > 0 && namespaces.includes(head)) return bundles[locale][head]?.get(key.slice(dot + 1));
  return bundles[locale].common?.get(key);
}

function placeholders(text: string): string[] {
  return [...text.matchAll(/\{(\w+)\s*[,}]/g)].map((match) => match[1] ?? "").filter((name) => !["plural", "one", "other", "select"].includes(name)).sort();
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) sourceFiles(path, out);
    else if (/\.tsx?$/.test(entry)) out.push(path);
  }
  return out;
}

describe("mobile i18n", () => {
  test("every namespace has the same keys and placeholders in pt-BR and en", () => {
    for (const ns of namespaces) {
      const pt = bundles["pt-BR"][ns] ?? new Map<string, string>();
      const en = bundles.en[ns] ?? new Map<string, string>();
      expect([...en.keys()].sort()).toEqual([...pt.keys()].sort());
      for (const [key, value] of pt) {
        expect(value.trim().length).toBeGreaterThan(0);
        expect({ key, names: placeholders(en.get(key) ?? "") }).toEqual({ key, names: placeholders(value) });
      }
    }
  });

  test("every literal key used by T03 code resolves in both locales", () => {
    const pattern = /["'`]((?:ui|routes|permissions|media|placeholder|auth|sync|assets|settings|common)\.[A-Za-z0-9_.-]+)["'`]/g;
    const missing: string[] = [];
    for (const file of [...sourceFiles(join(root, "src")), ...sourceFiles(join(root, "app"))]) {
      if (file.includes(`${join("src", "i18n")}`) || file.includes(join("src", "sync", "mutators"))) continue;
      for (const match of readFileSync(file, "utf8").matchAll(pattern)) {
        const key = match[1] ?? "";
        for (const locale of LOCALES) if (lookup(locale, key) === undefined) missing.push(`${locale}:${key}`);
      }
    }
    expect(missing).toEqual([]);
  });

  test("dynamic key families are complete", () => {
    const keys = [
      ...MutationNameEnum.options.map((name) => `sync.mutation.${name}`),
      ...AssetConditionEnum.options.map((value) => `assets.condition.${value}`),
      ...MediaTagEnum.options.map((value) => `media.tag.${value}`),
      ...MediaKindEnum.options.map((value) => `sync.upload.kind.${value}`),
      ...["PENDING", "IN_FLIGHT", "REJECTED"].map((value) => `sync.status.${value}`),
      ...["offline", "camera", "location", "notifications"].flatMap((slide) => [`auth.onboarding.${slide}.title`, `auth.onboarding.${slide}.body`]),
      ...["pt-BR", "en"].map((value) => `settings.language.${value}`),
      ...["apple", "google", "waze", "system"].map((value) => `settings.nav.${value}`),
      ...["system", "light", "dark", "outdoor"].map((value) => `settings.theme.${value}`),
      ...["camera", "microphone", "locationForeground", "locationBackground", "notifications", "photos"].flatMap((kind) =>
        ["undetermined", "denied", "blocked", "limited", "granted"].flatMap((state) => [`permissions.${kind}.${state}.title`, `permissions.${kind}.${state}.body`]).concat(`permissions.${kind}.alt`),
      ),
      ...["askAgain", "checkAgain", "openSettings"].map((action) => `permissions.action.${action}`),
      ...ALL_ERROR_CODES.flatMap((code) => [`errors.${code}.title`, `errors.${code}.body`]),
    ];
    const missing = LOCALES.flatMap((locale) => keys.filter((key) => lookup(locale, key) === undefined).map((key) => `${locale}:${key}`));
    expect(missing).toEqual([]);
  });
});
