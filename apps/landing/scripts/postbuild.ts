/**
 * Runs after `next build`. Finishes the static export so that any static host (and Caddy in
 * production) can serve `out/` as is:
 * - writes `out/index.html`, which sends `/` to the visitor's locale;
 * - copies the Portuguese 404 page to `out/404.html`;
 * - removes the React Server Components payload files, which the site never fetches because it
 *   has no client-side navigation;
 * - checks that every error code has a help page in both locales at the path `helpUrl()` returns.
 */
import { copyFileSync, existsSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ALL_ERROR_CODES } from "@agrorende/contracts/errors";
import { helpUrl } from "@agrorende/i18n/helpUrl";

import { appLocale, SITE_LOCALES } from "../src/lib/locales";
import { allRoutes, helpErrorPath, isIndexable, pathFor } from "../src/lib/routes";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "out");

function fail(message: string): never {
  console.error(`postbuild: ${message}`);
  process.exit(1);
}

export function rootIndexHtml(): string {
  const links = SITE_LOCALES.map(
    (locale) => `<link rel="alternate" hreflang="${appLocale(locale)}" href="/${locale}/">`,
  ).join("");
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AgroRende</title><meta name="robots" content="noindex,follow"><link rel="canonical" href="/pt-br/">${links}<link rel="alternate" hreflang="x-default" href="/pt-br/"><script>(function(){try{var l=(navigator.languages&&navigator.languages[0])||navigator.language||"";if(/^en/i.test(l)){location.replace("/en/"+location.search);return}}catch(e){}location.replace("/pt-br/"+location.search)})();</script><meta http-equiv="refresh" content="0; url=/pt-br/"></head><body><p><a href="/pt-br/">AgroRende em português</a> · <a href="/en/" lang="en">AgroRende in English</a></p></body></html>\n`;
}

function removeFlightFiles(dir: string): number {
  let removed = 0;
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      removed += removeFlightFiles(full);
    } else if (entry.endsWith(".txt") && full !== path.join(out, "robots.txt")) {
      rmSync(full);
      removed += 1;
    }
  }
  return removed;
}

function htmlFor(urlPath: string): string {
  return path.join(out, ...urlPath.split("/").filter((part) => part.length > 0), "index.html");
}

function main(): void {
  if (!existsSync(out)) fail("out/ is missing; run `next build` first");

  writeFileSync(path.join(out, "index.html"), rootIndexHtml());
  copyFileSync(htmlFor("/pt-br/404/"), path.join(out, "404.html"));
  rmSync(path.join(out, "_not-found"), { recursive: true, force: true });
  const removed = removeFlightFiles(out);

  const missing: string[] = [];
  for (const locale of SITE_LOCALES) {
    for (const route of allRoutes()) {
      if (!existsSync(htmlFor(pathFor(route, locale)))) missing.push(pathFor(route, locale));
    }
    for (const code of ALL_ERROR_CODES) {
      const expected = helpUrl(code, appLocale(locale));
      if (`${expected}/` !== helpErrorPath(code, locale)) {
        missing.push(`${code}: helpUrl ${expected} does not match ${helpErrorPath(code, locale)}`);
      }
    }
  }
  if (missing.length > 0) fail(`missing or mismatched pages:\n${missing.join("\n")}`);

  const indexable = allRoutes().filter(isIndexable).length * SITE_LOCALES.length;
  console.log(
    `postbuild: ${allRoutes().length * SITE_LOCALES.length} pages, ${indexable} indexable, ${ALL_ERROR_CODES.length} error codes per locale, ${removed} payload files removed`,
  );
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
