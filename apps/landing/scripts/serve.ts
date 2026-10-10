/**
 * Serves `out/` the way the production Caddy site block does (infra/caddy/Caddyfile), for local
 * review, Playwright and Lighthouse. Usage: `pnpm --filter landing serve [--port 3301]`.
 * It never writes anything and only reads files below `out/`.
 */
import { createReadStream, existsSync, realpathSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import path from "node:path";
import { createGzip } from "node:zlib";
import { fileURLToPath } from "node:url";

import { localeFromAcceptLanguage } from "../src/lib/locales";

export const DEFAULT_PORT = 3301;

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".avif": "image/avif",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};

/** Same policy as the Caddy site block: only same-origin resources, inline scripts for the static export. */
export const SITE_HEADERS: Record<string, string> = {
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

const HELP_BASES = [
  { prefix: "/pt-br/ajuda/erros/", unknown: "/pt-br/ajuda/erros/codigo-desconhecido/index.html" },
  { prefix: "/en/help/errors/", unknown: "/en/help/errors/unknown-code/index.html" },
] as const;

export function cacheControl(urlPath: string): string {
  if (urlPath.startsWith("/_next/static/")) return "public, max-age=31536000, immutable";
  if (/\.(?:png|ico|svg|avif|webp|woff2)$/u.test(urlPath)) return "public, max-age=604800";
  return "no-cache";
}

/** Which file answers a 404, mirroring `handle_errors 404` in the Caddyfile. */
export function notFoundFile(urlPath: string): string {
  for (const base of HELP_BASES) if (urlPath.startsWith(base.prefix)) return base.unknown;
  if (urlPath === "/en" || urlPath.startsWith("/en/")) return "/en/404/index.html";
  return "/404.html";
}

function resolveFile(outDir: string, urlPath: string): string | undefined {
  const candidates = [urlPath, path.posix.join(urlPath, "index.html"), `${urlPath}.html`];
  for (const candidate of candidates) {
    const full = path.join(outDir, candidate);
    if (!full.startsWith(outDir)) return undefined;
    // Linux (and Caddy in production) is case-sensitive; macOS is not, so compare the real path.
    if (existsSync(full) && statSync(full).isFile() && realpathSync.native(full) === full) return full;
  }
  return undefined;
}

const COMPRESSIBLE = new Set([".html", ".js", ".css", ".json", ".txt", ".xml", ".svg"]);

function send(req: IncomingMessage, res: ServerResponse, file: string, status: number, urlPath: string): void {
  // Mirrors `encode zstd gzip` in the Caddyfile so Lighthouse measures realistic transfer sizes.
  const gzip = COMPRESSIBLE.has(path.extname(file)) && /\bgzip\b/u.test(String(req.headers["accept-encoding"] ?? ""));
  res.writeHead(status, {
    ...SITE_HEADERS,
    "Content-Type": MIME[path.extname(file)] ?? "application/octet-stream",
    "Cache-Control": status === 200 ? cacheControl(urlPath) : "no-cache",
    Vary: "Accept-Encoding",
    ...(gzip ? { "Content-Encoding": "gzip" } : {}),
  });
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  if (gzip) createReadStream(file).pipe(createGzip()).pipe(res);
  else createReadStream(file).pipe(res);
}

export function handler(outDirInput: string) {
  const outDir = realpathSync.native(outDirInput);
  return (req: IncomingMessage, res: ServerResponse): void => {
    const method = req.method ?? "GET";
    if (method !== "GET" && method !== "HEAD") {
      res.writeHead(405, { Allow: "GET, HEAD" }).end();
      return;
    }
    const url = new URL(req.url ?? "/", "http://localhost");
    let urlPath: string;
    try {
      urlPath = decodeURIComponent(url.pathname);
    } catch {
      urlPath = "/";
    }
    if (urlPath === "/") {
      const locale = localeFromAcceptLanguage(req.headers["accept-language"]);
      res.writeHead(302, { ...SITE_HEADERS, Location: `/${locale}/${url.search}`, Vary: "Accept-Language", "Cache-Control": "no-cache" });
      res.end();
      return;
    }
    // Directory paths without the trailing slash redirect, like Caddy's file_server does.
    const dirIndex = path.join(outDir, urlPath, "index.html");
    if (!urlPath.endsWith("/") && existsSync(dirIndex) && realpathSync.native(dirIndex) === dirIndex) {
      res.writeHead(308, { ...SITE_HEADERS, Location: `${urlPath}/${url.search}` });
      res.end();
      return;
    }
    const file = resolveFile(outDir, urlPath);
    if (file !== undefined) {
      send(req, res, file, 200, urlPath);
      return;
    }
    send(req, res, path.join(outDir, notFoundFile(urlPath)), 404, urlPath);
  };
}

export function startServer(port: number, outDir: string): Server {
  return createServer(handler(outDir)).listen(port, "127.0.0.1");
}

function main(): void {
  const portArg = process.argv.indexOf("--port");
  const port = Number(portArg === -1 ? (process.env.PORT ?? DEFAULT_PORT) : process.argv[portArg + 1]);
  const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "out");
  if (!existsSync(outDir)) {
    console.error("serve: out/ is missing; run `pnpm --filter landing build` first");
    process.exit(1);
  }
  startServer(port, outDir);
  console.log(`site: serving ${outDir} on http://localhost:${port}`);
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
