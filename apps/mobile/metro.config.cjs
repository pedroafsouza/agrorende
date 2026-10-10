// Metro configuration for the AgroRende mobile app.
// The workspace packages (`@agrorende/contracts`, `@agrorende/api-client`, …) are TypeScript
// sources that use NodeNext-style relative specifiers ending in `.js`. Metro cannot map those to
// `.ts` files on its own, so relative `.js` requests are retried without the extension first.
const { getDefaultConfig } = require("expo/metro-config");
const http = require("node:http");
const https = require("node:https");
const path = require("node:path");

const config = getDefaultConfig(__dirname);
const defaultResolve = config.resolver.resolveRequest;

// expo-sqlite on the web loads its SQLite engine as a WebAssembly asset.
config.resolver.assetExts = [...config.resolver.assetExts, "wasm"];

// Native-only packages that have no web build. The development web preview (`expo start --web`)
// resolves them to small stand-ins in `src/web-shims/`; iOS and Android keep the real packages.
const WEB_SHIMS = {
  "react-native-maps": "src/web-shims/react-native-maps.tsx",
  "react-native-signature-canvas": "src/web-shims/react-native-signature-canvas.tsx",
};

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = defaultResolve ?? context.resolveRequest;
  if (platform === "web" && Object.hasOwn(WEB_SHIMS, moduleName)) {
    return { type: "sourceFile", filePath: path.join(__dirname, WEB_SHIMS[moduleName]) };
  }
  if (moduleName.startsWith(".") && moduleName.endsWith(".js")) {
    try {
      return resolve(context, moduleName.slice(0, -3), platform);
    } catch {
      // Fall through to the original specifier.
    }
  }
  return resolve(context, moduleName, platform);
};

/**
 * Development-only web support (`expo start --web`, used by the demo-video recorder).
 * - expo-sqlite on the web needs a cross-origin isolated page (COOP + COEP) for SharedArrayBuffer.
 * - `AGRORENDE_WEB_API_PROXY` (for example `http://localhost:3000`) forwards `/api/*` from the
 *   Metro origin to the admin API, so the browser never makes a cross-origin API request.
 * Native bundles are unaffected: the headers are harmless and the proxy only matches `/api/`.
 */
const apiProxy = process.env.AGRORENDE_WEB_API_PROXY;

/** Joins the request path onto the proxy URL, keeping any path prefix the proxy URL has (`http://host/prefix`). */
function proxyTarget(base, requestUrl) {
  const target = new URL(base);
  if (target.protocol !== "http:" && target.protocol !== "https:") throw new Error(`unsupported proxy protocol ${target.protocol}`);
  const incoming = new URL(requestUrl, "http://metro.invalid");
  target.pathname = `${target.pathname.replace(/\/+$/u, "")}${incoming.pathname}`;
  target.search = incoming.search;
  return target;
}
config.server = {
  ...config.server,
  enhanceMiddleware: (middleware) => (req, res, next) => {
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Cross-Origin-Embedder-Policy", "credentialless");
    if (apiProxy !== undefined && apiProxy !== "" && typeof req.url === "string" && req.url.startsWith("/api/")) {
      const fail = (message) => {
        process.stderr.write(`[web api proxy] ${req.method} ${req.url.split("?")[0]} failed: ${message}\n`);
        if (!res.headersSent) res.writeHead(502);
        res.end();
      };
      try {
        const target = proxyTarget(apiProxy, req.url);
        const transport = target.protocol === "https:" ? https : http;
        const headers = { ...req.headers, host: target.host };
        delete headers.origin;
        const upstream = transport.request(target, { method: req.method, headers }, (upstreamRes) => {
          res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
          upstreamRes.pipe(res);
        });
        upstream.on("error", (error) => fail(error.message));
        req.pipe(upstream);
      } catch (error) {
        fail(typeof error?.message === "string" ? error.message : String(error));
      }
      return;
    }
    return middleware(req, res, next);
  },
};

module.exports = config;
