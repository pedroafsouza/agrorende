import { NO_NON_NULL_SYNTAX, TEST_FILES } from "@agrorende/config/eslint";
import node from "@agrorende/config/eslint/node";

/** packages/db owns the MongoDB driver (ARCHITECTURE §11), so the driver import and `.collection(` bans are lifted here. */
export default [
  ...node({ restricted: { paths: [], patterns: [{ group: ["@agrorende/*/src/*"], message: "Import the package entry point, not its internals." }] } }),
  { rules: { "no-restricted-syntax": ["error", NO_NON_NULL_SYNTAX] } },
  { files: TEST_FILES, rules: { "no-restricted-imports": "off", "no-restricted-syntax": "off" } },
];
