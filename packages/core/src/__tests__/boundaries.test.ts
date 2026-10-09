import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * T10.15 part 1 (ARCHITECTURE §4, D1.1): only `packages/db` may import the MongoDB driver or call
 * `.collection(` directly. Every other workspace package and app goes through the db repositories.
 */

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const SELF = relative(REPO_ROOT, fileURLToPath(import.meta.url));
const WORKSPACE_DIRS = ["apps", "packages"] as const;
const ALLOWED_PACKAGE = "packages/db";
const SKIPPED_DIRS = new Set(["node_modules", "dist", ".next", ".expo", ".turbo", "build", "coverage", "out"]);
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"]);

const DRIVER_IMPORT_PATTERNS = [
  /\bfrom\s+["']mongodb(?:\/[^"']*)?["']/u,
  /\bimport\s+["']mongodb(?:\/[^"']*)?["']/u,
  /\bimport\s*\(\s*["']mongodb(?:\/[^"']*)?["']\s*\)/u,
  /\brequire\s*\(\s*["']mongodb(?:\/[^"']*)?["']\s*\)/u,
];
const COLLECTION_CALL = /\.collection\s*(?:<[^>()]*>)?\s*\(/u;

/**
 * Files allowed to break the rule. T10.15 moved every former offender (worker jobs, core sync
 * pull/push and the core test harnesses) onto the `@agrorende/db` accessors, so the list is empty
 * and any new violation fails the suite. An entry fails once its file is clean, so the list can
 * only shrink.
 */
const KNOWN_VIOLATIONS: ReadonlySet<string> = new Set<string>([]);

type Violation = { file: string; line: number; rule: "mongodb import" | ".collection( call"; text: string };

function workspaceRoots(): string[] {
  return WORKSPACE_DIRS.flatMap((dir) =>
    readdirSync(resolve(REPO_ROOT, dir), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !SKIPPED_DIRS.has(entry.name))
      .map((entry) => `${dir}/${entry.name}`),
  ).filter((root) => root !== ALLOWED_PACKAGE && existsSync(resolve(REPO_ROOT, root, "package.json")));
}

function sourceFiles(root: string): string[] {
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRS.has(entry.name)) {
          walk(join(dir, entry.name));
        }
      } else if (entry.isFile() && SOURCE_EXTENSIONS.has(extname(entry.name)) && !entry.name.endsWith(".d.ts")) {
        files.push(join(dir, entry.name));
      }
    }
  };
  walk(resolve(REPO_ROOT, root));
  return files;
}

function scan(file: string): Violation[] {
  const relativeFile = relative(REPO_ROOT, file);
  if (relativeFile === SELF) {
    return [];
  }
  const violations: Violation[] = [];
  readFileSync(file, "utf8")
    .split("\n")
    .forEach((text, index) => {
      const trimmed = text.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) {
        return;
      }
      if (DRIVER_IMPORT_PATTERNS.some((pattern) => pattern.test(text))) {
        violations.push({ file: relativeFile, line: index + 1, rule: "mongodb import", text: trimmed });
      }
      if (COLLECTION_CALL.test(text)) {
        violations.push({ file: relativeFile, line: index + 1, rule: ".collection( call", text: trimmed });
      }
    });
  return violations;
}

const roots = workspaceRoots();

describe("raw MongoDB access stays inside packages/db", () => {
  it("scans every workspace package and app except packages/db", () => {
    expect(roots).toEqual(expect.arrayContaining(["packages/core", "packages/contracts", "apps/web", "apps/worker"]));
    expect(roots).not.toContain(ALLOWED_PACKAGE);
  });

  it("detects driver imports and collection calls", () => {
    const lines = [
      'import { MongoClient } from "mongodb";',
      'const { ObjectId } = require("mongodb");',
      'await import("mongodb")',
      'import type { Db } from "mongodb";',
    ];
    expect(lines.every((line) => DRIVER_IMPORT_PATTERNS.some((pattern) => pattern.test(line)))).toBe(true);
    expect(COLLECTION_CALL.test('db.collection<User>("users")')).toBe(true);
    expect(COLLECTION_CALL.test('db.collection("users")')).toBe(true);
    expect(DRIVER_IMPORT_PATTERNS.some((pattern) => pattern.test('import { db } from "@agrorende/db";'))).toBe(false);
  });

  const violationsByRoot = new Map(roots.map((root) => [root, sourceFiles(root).flatMap(scan)]));

  for (const root of roots) {
    it(`${root} neither imports mongodb nor calls .collection( outside the known baseline`, () => {
      const violations = (violationsByRoot.get(root) ?? [])
        .filter((violation) => !KNOWN_VIOLATIONS.has(violation.file))
        .map((violation) => `${violation.file}:${violation.line} ${violation.rule}: ${violation.text}`);
      expect(violations).toEqual([]);
    });
  }

  it("keeps the known-violation baseline limited to files that still violate", () => {
    const violating = new Set([...violationsByRoot.values()].flat().map((violation) => violation.file));
    expect([...KNOWN_VIOLATIONS].filter((file) => !violating.has(file))).toEqual([]);
  });
});
