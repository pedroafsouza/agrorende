import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

/**
 * Shared flat ESLint configuration for AgroRende.
 *
 * The dependency rules of ARCHITECTURE section 4 are enforced here with
 * `no-restricted-imports`, so that a package can never reach into a layer it is not
 * allowed to depend on. Each package composes this base with the preset it needs.
 */

/** Files that are never part of the shipped application. */
export const TEST_FILES = [
  "**/*.test.ts",
  "**/*.test.tsx",
  "**/*.spec.ts",
  "**/*.spec.tsx",
  "**/test/**",
  "**/testing/**",
  "**/e2e/**",
  "**/scripts/**",
  "**/seed/**",
];

export const IGNORES = [
  "**/dist/**",
  "**/.next/**",
  "**/out/**",
  "**/coverage/**",
  "**/node_modules/**",
  "**/android/**",
  "**/ios/**",
  "**/.expo/**",
  "**/drizzle/**",
  ".github/skills/**",
];

/** `contracts` depends on nothing except zod: no Node APIs, no React Native APIs. */
export const CONTRACTS_RESTRICTED = {
  paths: [
    { name: "mongodb", message: "Only packages/db may import the MongoDB driver." },
    { name: "react", message: "packages/contracts must stay free of UI frameworks." },
    { name: "react-native", message: "packages/contracts must stay free of UI frameworks." },
    { name: "fs", message: "packages/contracts must not use Node APIs." },
    { name: "node:fs", message: "packages/contracts must not use Node APIs." },
    { name: "path", message: "packages/contracts must not use Node APIs." },
    { name: "node:path", message: "packages/contracts must not use Node APIs." },
    { name: "@agrorende/db", message: "packages/contracts depends on nothing except zod." },
    { name: "@agrorende/core", message: "packages/contracts depends on nothing except zod." },
  ],
  patterns: [
    { group: ["@agrorende/*/src/*"], message: "Import the package entry point, not its internals." },
  ],
};

/** `core` may use contracts, db, ioredis and jose, but never Next.js or React. */
export const CORE_RESTRICTED = {
  paths: [
    { name: "mongodb", message: "Only packages/db may import the MongoDB driver." },
    { name: "next", message: "packages/core must never import Next.js." },
    { name: "react", message: "packages/core must never import React." },
    { name: "bullmq", message: "Only packages/core/src/jobs/** may import bullmq." },
    { name: "csv-stringify", message: "Only packages/core/src/modules/exports/** may import csv-stringify." },
    { name: "@react-pdf/renderer", message: "Only packages/core/src/pdf/** may import @react-pdf/renderer." },
  ],
  patterns: [
    { group: ["next/*"], message: "packages/core must never import Next.js." },
    { group: ["@agrorende/*/src/*"], message: "Import the package entry point, not its internals." },
  ],
};

/** Everything outside packages/db is forbidden to touch the driver. */
export const NO_DRIVER_RESTRICTED = {
  paths: [{ name: "mongodb", message: "Only packages/db may import the MongoDB driver." }],
  patterns: [
    { group: ["@agrorende/*/src/*"], message: "Import the package entry point, not its internals." },
  ],
};

/** Non-null assertions hide missing narrowing; tests may use them. */
export const NO_NON_NULL_SYNTAX = {
  selector: "TSNonNullExpression",
  message: "No non-null assertions outside tests: narrow the type or validate with Zod.",
};

/**
 * ARCHITECTURE §11: raw driver access exists only inside packages/db. A member call named
 * `collection` (`db.collection(name)`) bypasses the typed accessors, so it is banned everywhere
 * else, tests included. packages/db turns this selector off in its own config.
 */
export const NO_RAW_COLLECTION_SYNTAX = {
  selector: "CallExpression[callee.type='MemberExpression'][callee.property.name='collection']",
  message:
    "Raw driver collection access (a member call named `collection`) exists only inside packages/db: use the `collection(db, name)` function, `collections.<name>(db)` or `scoped(ctx, db)` from @agrorende/db.",
};

/** `no-restricted-imports` for tests: the driver stays banned there too, other import rules are relaxed. */
export const TEST_RESTRICTED = {
  paths: [{ name: "mongodb", message: "Only packages/db may import the MongoDB driver." }],
};

/** Base rules shared by every package. */
export const base = tseslint.config(
  { ignores: IGNORES },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: { ...globals.es2024 },
    },
    rules: {
      "no-console": "error",
      "no-restricted-syntax": ["error", NO_NON_NULL_SYNTAX, NO_RAW_COLLECTION_SYNTAX],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: TEST_FILES,
    rules: {
      "no-console": "off",
      "no-restricted-syntax": ["error", NO_RAW_COLLECTION_SYNTAX],
    },
  },
);

export default base;
