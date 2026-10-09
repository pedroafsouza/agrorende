import globals from "globals";
import tseslint from "typescript-eslint";

import base, { NO_DRIVER_RESTRICTED, TEST_FILES, TEST_RESTRICTED } from "./index.js";

/**
 * Preset for Node services and server-side packages.
 *
 * `restricted` lets a package pass its own `no-restricted-imports` option, so that
 * `packages/contracts`, `packages/core` and `packages/db` can each enforce the dependency
 * rules of ARCHITECTURE section 4 that apply to them.
 */
export function node({ restricted = NO_DRIVER_RESTRICTED } = {}) {
  return tseslint.config(
    ...base,
    {
      languageOptions: {
        globals: { ...globals.node },
      },
      rules: {
        "no-restricted-imports": ["error", restricted],
      },
    },
    {
      files: TEST_FILES,
      rules: {
        "no-restricted-imports": ["error", TEST_RESTRICTED],
      },
    },
  );
}

export default node;
