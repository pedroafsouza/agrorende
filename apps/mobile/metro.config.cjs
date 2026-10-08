// Metro configuration for the AgroRende mobile app.
// The workspace packages (`@agrorende/contracts`, `@agrorende/api-client`, …) are TypeScript
// sources that use NodeNext-style relative specifiers ending in `.js`. Metro cannot map those to
// `.ts` files on its own, so relative `.js` requests are retried without the extension first.
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
const defaultResolve = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = defaultResolve ?? context.resolveRequest;
  if (moduleName.startsWith(".") && moduleName.endsWith(".js")) {
    try {
      return resolve(context, moduleName.slice(0, -3), platform);
    } catch {
      // Fall through to the original specifier.
    }
  }
  return resolve(context, moduleName, platform);
};

module.exports = config;
