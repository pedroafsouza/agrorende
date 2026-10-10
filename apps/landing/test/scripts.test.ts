import { describe, expect, it } from "vitest";

import { rootIndexHtml } from "../scripts/postbuild";
import { cacheControl, notFoundFile, SITE_HEADERS } from "../scripts/serve";

describe("serve (local mirror of the Caddyfile)", () => {
  it("caches hashed assets forever, images for a week and HTML not at all", () => {
    expect(cacheControl("/_next/static/chunks/a.js")).toContain("immutable");
    expect(cacheControl("/images/hero-field-640.avif")).toBe("public, max-age=604800");
    expect(cacheControl("/pt-br/")).toBe("no-cache");
  });

  it("answers 404s with the localized page and unknown help codes with the unknown-code page", () => {
    expect(notFoundFile("/pt-br/ajuda/erros/xyz/")).toBe("/pt-br/ajuda/erros/codigo-desconhecido/index.html");
    expect(notFoundFile("/en/help/errors/xyz/")).toBe("/en/help/errors/unknown-code/index.html");
    expect(notFoundFile("/en/nope/")).toBe("/en/404/index.html");
    expect(notFoundFile("/es/")).toBe("/404.html");
  });

  it("sends a strict same-origin CSP", () => {
    const csp = SITE_HEADERS["Content-Security-Policy"] ?? "";
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toMatch(/https?:\/\//u);
  });
});

describe("root index", () => {
  it("redirects to a locale, is not indexed and works without JavaScript", () => {
    const html = rootIndexHtml();
    expect(html).toContain('content="noindex,follow"');
    expect(html).toContain('http-equiv="refresh" content="0; url=/pt-br/"');
    expect(html).toContain('hreflang="en" href="/en/"');
    expect(html).toContain('href="/en/"');
  });
});
