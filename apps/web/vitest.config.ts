import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    extensions: [".ts", ".tsx", ".js", ".mjs", ".json"],
  },
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // Component tests opt into jsdom with a `// @vitest-environment jsdom` docblock.
    environment: "node",
    server: { deps: { inline: [/@agrorende\//u] } },
  },
});
