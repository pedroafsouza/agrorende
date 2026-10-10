import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

export const MAIN_PAGES = {
  "pt-br": [
    "/pt-br/",
    "/pt-br/recursos/",
    "/pt-br/planos/",
    "/pt-br/ajuda/",
    "/pt-br/privacidade/",
    "/pt-br/termos/",
    "/pt-br/dpa/",
    "/pt-br/excluir-conta/",
    "/pt-br/ajuda/erros/first-sync-large/",
  ],
  en: [
    "/en/",
    "/en/features/",
    "/en/pricing/",
    "/en/help/",
    "/en/privacy/",
    "/en/terms/",
    "/en/dpa/",
    "/en/delete-account/",
    "/en/help/errors/first-sync-large/",
  ],
} as const;

/** Collects console errors and every request that leaves the site's origin. */
export function watchPage(page: Page, origin: string): { errors: string[]; foreign: string[] } {
  const errors: string[] = [];
  const foreign: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.protocol !== "data:" && url.origin !== origin) foreign.push(request.url());
  });
  return { errors, foreign };
}

export async function expectNoAxeViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(results.violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`)).toEqual([]);
}
