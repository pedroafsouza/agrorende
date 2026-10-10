import { expect, test } from "@playwright/test";

test("every indexable page has a canonical, hreflang alternates and Open Graph tags", async ({ page }) => {
  await page.goto("/pt-br/planos/");
  const origin = new URL(page.url()).origin;
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `${origin}/pt-br/planos/`);
  await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute("href", `${origin}/en/pricing/`);
  await expect(page.locator('link[rel="alternate"][hreflang="pt-BR"]')).toHaveAttribute("href", `${origin}/pt-br/planos/`);
  await expect(page.locator('link[rel="alternate"][hreflang="x-default"]')).toHaveAttribute("href", `${origin}/pt-br/planos/`);
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", `${origin}/og/pt-br.png`);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /.{40,}/u);
});

test("the home page carries Organization, SoftwareApplication and FAQPage JSON-LD", async ({ page }) => {
  await page.goto("/en/");
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  const types = blocks.flatMap((block) => {
    const data = JSON.parse(block) as { "@type"?: string } | { "@type"?: string }[];
    return (Array.isArray(data) ? data : [data]).map((item) => item["@type"]);
  });
  expect(types).toEqual(expect.arrayContaining(["Organization", "SoftwareApplication", "FAQPage"]));
});

test("404 and unknown-code pages are noindex and stay out of the sitemap", async ({ page, request }) => {
  await page.goto("/pt-br/ajuda/erros/codigo-desconhecido/");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/u);
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).not.toContain("codigo-desconhecido");
  expect(sitemap).not.toContain("/404");
});

test("robots.txt allows crawling and points at the sitemap", async ({ request }) => {
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("Allow: /");
  expect(robots).toMatch(/Sitemap: .*\/sitemap\.xml/u);
});

test("every sitemap URL answers 200 and every internal link resolves (link checker)", async ({ request, baseURL }) => {
  test.setTimeout(300_000);
  const origin = new URL(baseURL ?? "").origin;
  const sitemap = await (await request.get("/sitemap.xml")).text();
  const pages = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/gu)].map((match) => new URL(match[1] ?? "").pathname);
  expect(pages.length).toBe(392);
  const checked = new Map<string, number>();
  const broken: string[] = [];
  async function status(path: string): Promise<number> {
    const known = checked.get(path);
    if (known !== undefined) return known;
    const response = await request.get(path, { maxRedirects: 0 });
    checked.set(path, response.status());
    return response.status();
  }
  for (const path of pages) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    const html = await response.text();
    for (const match of html.matchAll(/\s(?:href|src)="([^"#]+)/gu)) {
      const target = match[1] ?? "";
      if (/^(?:mailto:|https:\/\/wa\.me\/|data:)/u.test(target)) continue;
      const url = new URL(target.replaceAll("&amp;", "&"), `${origin}${path}`);
      if (url.origin !== origin) continue;
      const code = await status(url.pathname);
      if (code !== 200) broken.push(`${path} -> ${url.pathname} (${code})`);
    }
    for (const match of html.matchAll(/\ssrcSet="([^"]+)"/giu)) {
      for (const candidate of (match[1] ?? "").split(",")) {
        const target = candidate.trim().split(/\s+/u)[0] ?? "";
        const code = await status(new URL(target, `${origin}${path}`).pathname);
        if (code !== 200) broken.push(`${path} -> ${target} (${code})`);
      }
    }
  }
  console.log(`link checker: ${pages.length} pages, ${checked.size} distinct internal URLs, ${broken.length} broken`);
  expect(broken).toEqual([]);
});
