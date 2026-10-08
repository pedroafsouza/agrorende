import { existsSync } from "node:fs";
import { loadRootEnv, rootPath } from "./devloop/env.ts";
import { error, info, ok, section, warn } from "./devloop/log.ts";
import { formatCommand, run } from "./devloop/shell.ts";

const steps = ["lint", "typecheck", "test"] as const;

type Step = (typeof steps)[number];

function filtersFromArgs(args: readonly string[]): readonly string[] {
  return args.filter((arg) => arg.trim().length > 0);
}

function commandForStep(step: Step, filters: readonly string[]): readonly string[] {
  const command = ["pnpm", "-r"];
  for (const filter of filters) {
    command.push("--filter", filter);
  }
  command.push("--if-present", "run", step);
  if (step === "lint") {
    command.splice(2, 0, "--parallel");
  }
  return command;
}

async function runStep(step: Step, filters: readonly string[]): Promise<boolean> {
  const command = commandForStep(step, filters);
  info(`run: ${formatCommand(command)}`);
  const result = await run(command, { timeoutMs: 180_000, streamPrefix: step });
  if (result.code === 0) {
    ok(`${step} passed`);
    return true;
  }
  error(`${step} failed: ${result.stderr.trim() || result.stdout.trim() || `exit ${result.code ?? "signal"}`}`);
  return false;
}

async function runI18n(filters: readonly string[]): Promise<boolean> {
  if (filters.length > 0 && !filters.some((filter) => filter.includes("i18n") || filter.includes("...") || filter === "./...")) {
    warn("i18n:check still runs because translations are a workspace-wide gate");
  }
  if (!existsSync(rootPath("packages", "i18n"))) {
    warn("packages/i18n missing; i18n:check skipped");
    return true;
  }
  const command = ["npx", "tsx", "scripts/i18n-check.ts"] as const;
  info(`run: ${formatCommand(command)}`);
  const result = await run(command, { timeoutMs: 120_000, streamPrefix: "i18n" });
  if (result.code === 0) {
    ok("i18n:check passed");
    return true;
  }
  error(`i18n:check failed: ${result.stderr.trim() || result.stdout.trim() || `exit ${result.code ?? "signal"}`}`);
  return false;
}

export async function runCheckOnly(args: readonly string[] = process.argv.slice(2)): Promise<number> {
  loadRootEnv();
  const filters = filtersFromArgs(args);
  section("check-only");
  if (filters.length > 0) {
    info(`filters: ${filters.join(", ")}`);
  } else {
    info("filters: workspace");
  }

  for (const step of steps) {
    if (!(await runStep(step, filters))) {
      return 1;
    }
  }

  return (await runI18n(filters)) ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void runCheckOnly().then((code) => { process.exitCode = code; });
}
