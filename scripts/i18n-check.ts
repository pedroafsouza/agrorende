import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, extname, join, relative } from "node:path";
import { ALL_ERROR_CODES } from "../packages/contracts/src/errors.ts";
import { REQUIRED_LOCALES } from "../packages/i18n/src/locales.ts";
import { error, ok, section, warn } from "./devloop/log.ts";
import { loadRootEnv, rootPath } from "./devloop/env.ts";

interface CliOptions {
  readonly locale?: string;
}

interface Issue {
  readonly path: string;
  readonly message: string;
}

interface LoadedNamespace {
  readonly locale: string;
  readonly namespace: string;
  readonly file: string;
  readonly value: unknown;
  readonly flat: ReadonlyMap<string, string>;
}

const localeRoot = rootPath("packages", "i18n", "locales");
const ignoredSearchDirs = new Set(["node_modules", ".git", "dist", ".next", "coverage", ".expo", "android", "ios"]);

function parseArgs(args: readonly string[]): CliOptions {
  const localeIndex = args.indexOf("--locale");
  if (localeIndex >= 0) {
    return { locale: args[localeIndex + 1] };
  }
  return {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

function flatten(value: unknown, prefix: string, output: Map<string, string>, issues: Issue[], path: string): void {
  if (typeof value === "string") {
    output.set(prefix, value);
    if (value.trim().length === 0) {
      issues.push({ path, message: `${prefix} is an empty string` });
    }
    return;
  }
  if (isRecord(value)) {
    for (const [key, child] of Object.entries(value)) {
      const next = prefix.length === 0 ? key : `${prefix}.${key}`;
      flatten(child, next, output, issues, path);
    }
    return;
  }
  if (prefix.length > 0) {
    issues.push({ path, message: `${prefix} must be a string or object` });
  }
}

function loadNamespace(locale: string, namespace: string, issues: Issue[]): LoadedNamespace | undefined {
  const file = join(localeRoot, locale, `${namespace}.json`);
  if (!existsSync(file)) {
    issues.push({ path: file, message: "missing namespace file" });
    return undefined;
  }
  try {
    const value = readJson(file);
    const flat = new Map<string, string>();
    flatten(value, "", flat, issues, file);
    return { locale, namespace, file, value, flat };
  } catch (jsonError) {
    issues.push({ path: file, message: jsonError instanceof Error ? jsonError.message : "invalid JSON" });
    return undefined;
  }
}

function namespacesForReference(issues: Issue[]): readonly string[] {
  const dir = join(localeRoot, "pt-BR");
  if (!existsSync(dir)) {
    issues.push({ path: dir, message: "reference locale pt-BR missing" });
    return [];
  }
  return readdirSync(dir)
    .filter((name) => extname(name) === ".json")
    .map((name) => basename(name, ".json"))
    .sort();
}

function matchingBrace(message: string, openIndex: number): number | undefined {
  let depth = 0;
  for (let index = openIndex; index < message.length; index += 1) {
    const char = message[index];
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
      if (depth < 0) {
        return undefined;
      }
    }
  }
  return undefined;
}

function extractPlaceholders(message: string): { readonly placeholders: ReadonlySet<string>; readonly errors: readonly string[] } {
  const placeholders = new Set<string>();
  const errors: string[] = [];

  function scan(fragment: string, offset: number): void {
    for (let index = 0; index < fragment.length; index += 1) {
      const char = fragment[index];
      if (char === "{") {
        const end = matchingBrace(fragment, index);
        if (end === undefined) {
          errors.push(`unclosed brace at ${offset + index}`);
          return;
        }
        const content = fragment.slice(index + 1, end).trim();
        if (content.length === 0) {
          errors.push(`empty placeholder at ${offset + index}`);
        } else {
          const comma = content.indexOf(",");
          const name = (comma >= 0 ? content.slice(0, comma) : content).trim();
          if (/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(name)) {
            placeholders.add(name);
            if (comma >= 0) {
              scan(content.slice(comma + 1), offset + index + 1 + comma + 1);
            }
          } else if (comma >= 0) {
            errors.push(`invalid placeholder "${name}" at ${offset + index}`);
          }
        }
        index = end;
      } else if (char === "}") {
        errors.push(`unmatched closing brace at ${offset + index}`);
      }
    }
  }

  scan(message, 0);
  return { placeholders, errors };
}

function sameSet(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  if (left.size !== right.size) {
    return false;
  }
  for (const value of left) {
    if (!right.has(value)) {
      return false;
    }
  }
  return true;
}

function setList(values: ReadonlySet<string>): string {
  return [...values].sort().join(", ");
}

function compareKeys(reference: LoadedNamespace, candidate: LoadedNamespace, issues: Issue[]): void {
  const referenceKeys = new Set(reference.flat.keys());
  const candidateKeys = new Set(candidate.flat.keys());
  for (const key of referenceKeys) {
    if (!candidateKeys.has(key)) {
      issues.push({ path: candidate.file, message: `missing key ${key} versus pt-BR` });
    }
  }
  for (const key of candidateKeys) {
    if (!referenceKeys.has(key)) {
      issues.push({ path: candidate.file, message: `extra key ${key} versus pt-BR` });
    }
  }
}

function validateMessages(reference: LoadedNamespace, candidate: LoadedNamespace, issues: Issue[]): void {
  for (const [key, message] of candidate.flat.entries()) {
    const parsed = extractPlaceholders(message);
    for (const parseError of parsed.errors) {
      issues.push({ path: candidate.file, message: `${key} ICU syntax: ${parseError}` });
    }
    const referenceMessage = reference.flat.get(key);
    if (referenceMessage !== undefined) {
      const referencePlaceholders = extractPlaceholders(referenceMessage).placeholders;
      if (!sameSet(referencePlaceholders, parsed.placeholders)) {
        issues.push({
          path: candidate.file,
          message: `${key} placeholders differ from pt-BR: expected [${setList(referencePlaceholders)}], got [${setList(parsed.placeholders)}]`,
        });
      }
    }
  }
}

function nestedString(value: unknown, path: readonly string[]): string | undefined {
  let current = value;
  for (const segment of path) {
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[segment];
  }
  return typeof current === "string" ? current : undefined;
}

function validateErrorMeta(namespace: LoadedNamespace, issues: Issue[]): void {
  for (const code of ALL_ERROR_CODES) {
    for (const field of ["title", "body", "action"] as const) {
      const value = nestedString(namespace.value, [code, field]);
      if (value === undefined || value.trim().length === 0) {
        issues.push({ path: namespace.file, message: `ERROR_META code ${code} missing errors.${code}.${field}` });
      }
    }
  }
}

function walkFiles(dir: string, files: string[]): void {
  if (!existsSync(dir)) {
    return;
  }
  for (const entry of readdirSync(dir)) {
    if (ignoredSearchDirs.has(entry)) {
      continue;
    }
    const path = join(dir, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) {
      walkFiles(path, files);
    } else if ([".ts", ".tsx", ".js", ".jsx", ".json"].includes(extname(entry))) {
      files.push(path);
    }
  }
}

function warnUnusedKeys(referenceNamespaces: readonly LoadedNamespace[]): void {
  const files: string[] = [];
  for (const dir of [rootPath("apps"), rootPath("packages")]) {
    walkFiles(dir, files);
  }
  const searchable = files
    .filter((file) => !file.includes(`${join("packages", "i18n", "locales")}`))
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");
  let count = 0;
  for (const namespace of referenceNamespaces) {
    for (const key of namespace.flat.keys()) {
      const fullKey = `${namespace.namespace}.${key}`;
      if (!searchable.includes(fullKey)) {
        warn(`unused i18n key: ${fullKey}`);
        count += 1;
      }
    }
  }
  if (count === 0) {
    ok("unused key scan: no unused keys found");
  }
}

function validateSeedLocalizedText(issues: Issue[]): void {
  const seedRoots = [rootPath("packages", "db", "seed"), rootPath("packages", "db", "src", "seed")];
  const files: string[] = [];
  for (const seedRoot of seedRoots) {
    walkFiles(seedRoot, files);
  }
  if (files.length === 0) {
    warn("seed LocalizedText check skipped: packages/db seed files not present");
    return;
  }
  const required = [...REQUIRED_LOCALES];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    const hasLocalizedMarker = text.includes("LocalizedText") || text.includes("pt-BR") || text.includes('"pt-BR"') || text.includes("'pt-BR'");
    if (!hasLocalizedMarker) {
      continue;
    }
    for (const locale of required) {
      if (!text.includes(locale)) {
        issues.push({ path: file, message: `seed LocalizedText may be missing required locale ${locale}` });
      }
    }
  }
}

async function main(): Promise<number> {
  loadRootEnv();
  const options = parseArgs(process.argv.slice(2));
  const issues: Issue[] = [];
  section("i18n-check");

  const namespaces = namespacesForReference(issues);
  const requiredLocales = options.locale === undefined ? [...REQUIRED_LOCALES] : [options.locale];
  const referenceNamespaces: LoadedNamespace[] = [];
  const references = new Map<string, LoadedNamespace>();
  for (const namespace of namespaces) {
    const loaded = loadNamespace("pt-BR", namespace, issues);
    if (loaded !== undefined) {
      references.set(namespace, loaded);
      referenceNamespaces.push(loaded);
    }
  }

  for (const locale of requiredLocales) {
    if (!existsSync(join(localeRoot, locale))) {
      issues.push({ path: join(localeRoot, locale), message: `locale directory missing for ${locale}` });
      continue;
    }
    for (const namespace of namespaces) {
      const reference = references.get(namespace);
      const candidate = loadNamespace(locale, namespace, issues);
      if (reference === undefined || candidate === undefined) {
        continue;
      }
      compareKeys(reference, candidate, issues);
      validateMessages(reference, candidate, issues);
      if (namespace === "errors") {
        validateErrorMeta(candidate, issues);
      }
    }
  }

  validateSeedLocalizedText(issues);
  warnUnusedKeys(referenceNamespaces);

  if (issues.length === 0) {
    ok(`i18n-check passed for ${requiredLocales.join(", ")}`);
    return 0;
  }
  for (const issue of issues) {
    error(`${relative(rootPath(), issue.path)}: ${issue.message}`);
  }
  error(`i18n-check failed with ${issues.length} failure(s)`);
  return 1;
}

void main().then((code) => { process.exitCode = code; });
