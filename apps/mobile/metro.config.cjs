// Metro configuration for the AgroRende mobile app.
// The workspace packages (`@agrorende/contracts`, `@agrorende/api-client`, …) are TypeScript
// sources that use NodeNext-style relative specifiers ending in `.js`. Metro cannot map those to
// `.ts` files on its own, so relative `.js` requests are retried without the extension first.
const { getDefaultConfig } = require("expo/metro-config");
const http = require("node:http");
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
config.server = {
  ...config.server,
  enhanceMiddleware: (middleware) => (req, res, next) => {
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Cross-Origin-Embedder-Policy", "credentialless");
    if (apiProxy !== undefined && apiProxy !== "" && typeof req.url === "string" && req.url.startsWith("/api/")) {
      const target = new URL(req.url, apiProxy);
      const headers = { ...req.headers, host: target.host };
      delete headers.origin;
      const upstream = http.request(target, { method: req.method, headers }, (upstreamRes) => {
        res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
        upstreamRes.pipe(res);
      });
      upstream.on("error", (error) => {
        process.stderr.write(`[web api proxy] ${req.method} ${target.pathname} failed: ${error.message}\n`);
        if (!res.headersSent) res.writeHead(502);
        res.end();
      });
      req.pipe(upstream);
      return;
    }
    return middleware(req, res, next);
  },
};

module.exports = config;
