/**
 * Runs after `next build`. Finishes the static export so that any static host (and Caddy in
 * production) can serve `out/` as is:
 * - writes `out/index.html`, which sends `/` to the visitor's locale;
 * - copies the Portuguese 404 page to `out/404.html`;
 * - removes the React Server Components payload files, which the site never fetches because it
 *   has no client-side navigation;
 * - checks that every error code has a help page in both locales at the path `helpUrl()` returns;
 * - starts the React runtime download after the page has loaded (see `deferRuntimeScripts`).
 */
import { copyFileSync, existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
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

/**
 * Every page reads without JavaScript (PRD SITE-05), so the ~120 KB runtime only powers extras such as
 * Lottie, help search and copy buttons. Loading it after `load` keeps it from competing with the HTML,
 * font and hero image for bandwidth on slow mobile networks, which is what LCP measures.
 */
export function deferRuntimeScripts(html: string): string {
  const scripts: { src: string; id?: string }[] = [];
  const stripped = html
    .replace(/<link rel="preload" as="script"[^>]*href="\/_next\/[^"]*"[^>]*>/gu, "")
    .replace(/<script src="(\/_next\/[^"]+)"(?: id="([^"]+)")? async=""><\/script>/gu, (_match, src: string, id?: string) => {
      scripts.push(id === undefined ? { src } : { src, id });
      return "";
    });
  if (scripts.length === 0 || !stripped.includes("</body>")) return html;
  const loader = `<script>(function(){var s=${JSON.stringify(scripts)};function go(){for(var i=0;i<s.length;i++){var e=document.createElement("script");e.src=s[i].src;if(s[i].id)e.id=s[i].id;e.async=true;document.body.appendChild(e)}}if(document.readyState==="complete")go();else addEventListener("load",go,{once:true})})()</script>`;
  return stripped.replace("</body>", `${loader}</body>`);
}

function deferAll(dir: string): number {
  let changed = 0;
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry !== "_next") changed += deferAll(full);
    } else if (entry.endsWith(".html")) {
      const html = readFileSync(full, "utf8");
      const next = deferRuntimeScripts(html);
      if (next !== html) {
        writeFileSync(full, next);
        changed += 1;
      }
    }
  }
  return changed;
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
  const deferred = deferAll(out);

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
    `postbuild: ${allRoutes().length * SITE_LOCALES.length} pages, ${indexable} indexable, ${ALL_ERROR_CODES.length} error codes per locale, ${removed} payload files removed, ${deferred} pages with a deferred runtime`,
  );
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
