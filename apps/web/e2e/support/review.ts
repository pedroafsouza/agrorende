import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

import type { Page } from "@playwright/test";

import { pseudoLocalize } from "@agrorende/i18n/pseudo";

import { REPO_ROOT } from "./env";

/** Locales captured for the UI-review gate: the two required locales plus the `en-XA` pseudo-locale. */
export const REVIEW_LOCALES = ["en", "pt-BR", "en-XA"] as const;
export type ReviewLocale = (typeof REVIEW_LOCALES)[number];

/** The locale the app actually renders; `en-XA` is English pseudo-localised in the page before capture. */
export function uiLocale(locale: ReviewLocale): "en" | "pt-BR" {
  return locale === "pt-BR" ? "pt-BR" : "en";
}

const MESSAGES_DIR = path.join(REPO_ROOT, "apps/web/messages");
const REVIEW_DIR = path.join(REPO_ROOT, ".data/reviews/T11");
const cache = new Map<string, Record<string, unknown>>();

function namespace(locale: "en" | "pt-BR", ns: string): Record<string, unknown> {
  const key = `${locale}/${ns}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;
  const loaded = JSON.parse(readFileSync(path.join(MESSAGES_DIR, locale, `${ns}.json`), "utf8")) as Record<string, unknown>;
  cache.set(key, loaded);
  return loaded;
}

/**
 * Reads a message from `apps/web/messages`, so a journey can run its selectors in every locale.
 * Simple `{name}` arguments are replaced; plural and select forms are not needed by the specs.
 */
export function msg(locale: ReviewLocale, ns: string, key: string, values: Readonly<Record<string, string>> = {}): string {
  let node: unknown = namespace(uiLocale(locale), ns);
  for (const part of key.split(".")) {
    node = (node as Record<string, unknown> | undefined)?.[part];
  }
  if (typeof node !== "string") throw new Error(`Missing message ${uiLocale(locale)}/${ns}:${key}`);
  return node.replace(/\{(\w+)\}/gu, (whole, name: string) => values[name] ?? whole);
}

/**
 * Saves a full-page screenshot to `.data/reviews/T11/<name>-<locale>.png`. For `en-XA` every visible
 * text node is pseudo-localised first (accents plus 40 % expansion), which exposes clipped labels
 * and hard-coded strings the same way the server-side pseudo-locale would.
 */
export async function reviewShot(page: Page, name: string, locale: ReviewLocale): Promise<void> {
  mkdirSync(REVIEW_DIR, { recursive: true });
  const file = path.join(REVIEW_DIR, `${name}-${locale}.png`);
  if (locale !== "en-XA") {
    await page.screenshot({ path: file, fullPage: true });
    return;
  }
  const texts = await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const found: string[] = [];
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      if ((node.textContent ?? "").trim().length > 0 && node.parentElement?.closest("script,style") === null) found.push(node.textContent ?? "");
    }
    return found;
  });
  const map = Object.fromEntries(texts.map((text) => [text, pseudoLocalize(text.trim())]));
  // Swap the text in place, capture, then put the original text back so React and later steps keep working.
  await page.evaluate((replacements) => {
    const swapped: [Node, string][] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const original = node.textContent ?? "";
      const next = replacements[original];
      if (next !== undefined) {
        swapped.push([node, original]);
        node.textContent = next;
      }
    }
    (window as unknown as { __arPseudo?: [Node, string][] }).__arPseudo = swapped;
  }, map);
  try {
    await page.screenshot({ path: file, fullPage: true });
  } finally {
    await page.evaluate(() => {
      const holder = window as unknown as { __arPseudo?: [Node, string][] };
      for (const [node, original] of holder.__arPseudo ?? []) node.textContent = original;
      delete holder.__arPseudo;
    });
  }
}
