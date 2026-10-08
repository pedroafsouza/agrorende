import { cpus, networkInterfaces } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";

const scriptsDir = dirname(dirname(fileURLToPath(import.meta.url)));
export const rootDir = dirname(scriptsDir);

export function rootPath(...parts: readonly string[]): string {
  return join(rootDir, ...parts);
}

export interface PackageJson {
  readonly packageManager?: string;
  readonly scripts?: Record<string, string>;
  readonly engines?: Record<string, string>;
}

export function readPackageJson(): PackageJson {
  return JSON.parse(readFileSync(rootPath("package.json"), "utf8")) as PackageJson;
}

function unquoteDotenvValue(value: string): string {
  if (value.length < 2) {
    return value;
  }
  const quote = value[0];
  if ((quote !== "\"" && quote !== "'") || value[value.length - 1] !== quote) {
    return value;
  }
  const inner = value.slice(1, -1);
  if (quote === "'") {
    return inner;
  }
  return inner
    .replaceAll("\\n", "\n")
    .replaceAll("\\r", "\r")
    .replaceAll("\\t", "\t")
    .replaceAll("\\\"", "\"")
    .replaceAll("\\\\", "\\");
}

function stripInlineComment(value: string): string {
  let quote: "\"" | "'" | undefined;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if ((char === "\"" || char === "'") && value[index - 1] !== "\\") {
      quote = quote === char ? undefined : quote ?? char;
    }
    if (char === "#" && quote === undefined && (index === 0 || /\s/.test(value[index - 1] ?? ""))) {
      return value.slice(0, index).trimEnd();
    }
  }
  return value.trimEnd();
}

export function parseDotenv(text: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) {
      continue;
    }
    const equals = line.indexOf("=");
    if (equals <= 0) {
      continue;
    }
    const key = line.slice(0, equals).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      continue;
    }
    const value = stripInlineComment(line.slice(equals + 1).trim());
    values.set(key, unquoteDotenvValue(value));
  }
  return values;
}

export function readEnvFile(path: string): Map<string, string> {
  if (!existsSync(path)) {
    return new Map<string, string>();
  }
  return parseDotenv(readFileSync(path, "utf8"));
}

export function envExampleKeys(): readonly string[] {
  return [...readEnvFile(rootPath(".env.example")).keys()].sort();
}

export function missingEnvKeys(): readonly string[] {
  const envPath = rootPath(".env");
  if (!existsSync(envPath)) {
    return envExampleKeys();
  }
  const current = readEnvFile(envPath);
  return envExampleKeys().filter((key) => !current.has(key));
}

export function ensureEnvFile(): "created" | "present" | "missing-example" {
  const example = rootPath(".env.example");
  const env = rootPath(".env");
  if (!existsSync(example)) {
    return "missing-example";
  }
  if (existsSync(env)) {
    return "present";
  }
  writeFileSync(env, readFileSync(example, "utf8"), { mode: 0o600 });
  return "created";
}

export function loadRootEnv(path = rootPath(".env")): ReadonlyMap<string, string> {
  const values = readEnvFile(path);
  for (const [key, value] of values.entries()) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
  return values;
}

export function currentAppEnv(): string {
  loadRootEnv();
  return process.env.APP_ENV ?? "local";
}

export function detectLanIPv4(): string | undefined {
  const interfaces = networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    if (entries === undefined) {
      continue;
    }
    for (const entry of entries) {
      if (entry.family === "IPv4" && !entry.internal && !entry.address.startsWith("169.254.")) {
        return entry.address;
      }
    }
  }
  return undefined;
}

export function writeMobileEnv(values: ReadonlyMap<string, string>): void {
  const dir = rootPath("apps", "mobile");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, ".env");
  const body = [...values.entries()].map(([key, value]) => `${key}=${value}`).join("\n");
  writeFileSync(path, `${body}\n`);
}

export function cpuCount(): number {
  return cpus().length;
}
