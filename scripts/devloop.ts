import { existsSync, readFileSync } from "node:fs";
import { runClean, runCommandAction, runDoctor, runReset } from "./devloop/actions.ts";
import { runEnvironmentCheck } from "./devloop/check.ts";
import { loadRootEnv, rootPath } from "./devloop/env.ts";
import { info, ok, section, warn } from "./devloop/log.ts";
import { setMobileTarget, runMobile, writeLanEnv } from "./devloop/mobile.ts";
import { runDevSetup } from "./devloop/setup.ts";

interface ParsedArgs {
  readonly check: boolean;
  readonly setup: boolean;
  readonly lan: boolean;
  readonly target?: "local" | "staging";
  readonly reset: boolean;
  readonly mobile?: "android" | "ios";
  readonly mcp: boolean;
  readonly doctor: boolean;
  readonly clean: boolean;
  readonly help: boolean;
}

function parseArgs(args: readonly string[]): ParsedArgs {
  let target: "local" | "staging" | undefined;
  let mobile: "android" | "ios" | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--target") {
      const value = args[index + 1];
      if (value === "local" || value === "staging") {
        target = value;
      }
      index += 1;
    } else if (arg === "--mobile") {
      const value = args[index + 1];
      if (value === "android" || value === "ios") {
        mobile = value;
        index += 1;
      }
    }
  }
  return {
    check: args.includes("--check"),
    setup: args.includes("--setup"),
    lan: args.includes("--lan"),
    target,
    reset: args.includes("--reset"),
    mobile,
    mcp: args.includes("--mcp"),
    doctor: args.includes("--doctor"),
    clean: args.includes("--clean"),
    help: args.includes("--help") || args.includes("-h"),
  };
}

function printMenu(): void {
  section("pnpm devloop");
  for (const line of [
    "Agents use flags; the interactive menu is intentionally non-blocking here.",
    "--check: read-only environment check",
    "--setup: pnpm install, --lan, pnpm dev:setup",
    "--lan: write apps/mobile/.env LAN URLs",
    "--target local|staging: point mobile env",
    "--reset: pnpm db:reset + pnpm storage:seed",
    "--mobile android|ios [--mcp]: dev client rebuild or Metro",
    "--doctor: expo-doctor, i18n, outdated, audit",
    "--clean: remove generated app caches only",
  ]) {
    info(line);
  }
}

async function runSetupFlag(): Promise<number> {
  loadRootEnv();
  const install = await runCommandAction(["pnpm", "install"], 300_000);
  if (install !== 0) {
    return install;
  }
  const lan = writeLanEnv();
  if (lan !== 0) {
    return lan;
  }
  return runDevSetup();
}

async function runCheckFlag(): Promise<number> {
  loadRootEnv();
  const environment = await runEnvironmentCheck();
  if (environment.failures.length === 0) {
    ok("devloop --check passed");
    return 0;
  }
  warn(`devloop --check failed with ${environment.failures.length} environment failure(s)`);
  return 1;
}

async function main(): Promise<number> {
  loadRootEnv();
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.help) {
    printMenu();
    return 0;
  }
  if (parsed.check) {
    return runCheckFlag();
  }
  if (parsed.setup) {
    return runSetupFlag();
  }
  if (parsed.lan) {
    return writeLanEnv();
  }
  if (parsed.target !== undefined) {
    return setMobileTarget(parsed.target);
  }
  if (parsed.reset) {
    return runReset();
  }
  if (parsed.mobile !== undefined) {
    return runMobile(parsed.mobile, parsed.mcp);
  }
  if (parsed.doctor) {
    return runDoctor();
  }
  if (parsed.clean) {
    return runClean();
  }

  if (existsSync(rootPath("docs", "ARCHITECTURE.md"))) {
    const architecture = readFileSync(rootPath("docs", "ARCHITECTURE.md"), "utf8");
    if (!architecture.includes("pnpm devloop --check")) {
      warn("ARCHITECTURE §16 not detected; commands still follow implemented flags");
    }
  }
  printMenu();
  return 0;
}

void main().then((code) => { process.exitCode = code; });
