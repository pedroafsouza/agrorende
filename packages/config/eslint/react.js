import i18next from "eslint-plugin-i18next";
import globals from "globals";
import tseslint from "typescript-eslint";

import base, { NO_DRIVER_RESTRICTED, TEST_FILES, TEST_RESTRICTED } from "./index.js";

/**
 * Preset for the React surfaces: the admin web app, the public site and the mobile app.
 *
 * `eslint-plugin-i18next` forbids literal strings in JSX (ARCHITECTURE section 20.3).
 * Tests, scripts and dev-only files are excluded, because the dev style-guide pages and
 * the test fixtures are not user-facing copy.
 */
export function react({ restricted = NO_DRIVER_RESTRICTED, devOnly = [] } = {}) {
  return tseslint.config(
    ...base,
    {
      languageOptions: {
        globals: { ...globals.browser, ...globals.node },
        parserOptions: {
          ecmaFeatures: { jsx: true },
        },
      },
      plugins: { i18next },
      rules: {
        "no-restricted-imports": ["error", restricted],
        "i18next/no-literal-string": [
          "error",
          { markupOnly: true, onlyAttribute: ["alt", "title", "aria-label", "placeholder"] },
        ],
      },
    },
    {
      files: [...TEST_FILES, ...devOnly],
      rules: {
        "i18next/no-literal-string": "off",
        "no-restricted-imports": ["error", TEST_RESTRICTED],
      },
    },
  );
}

export default react;
