import { existsSync, rmSync } from "node:fs";
import { currentAppEnv, rootPath } from "./env.ts";
import { formatCommand, run } from "./shell.ts";
import { error, info, ok, warn } from "./log.ts";

export async function runCommandAction(command: readonly string[], timeoutMs: number): Promise<number> {
  info(`run: ${formatCommand(command)}`);
  const result = await run(command, { timeoutMs, streamPrefix: command.join(" ") });
  if (result.code === 0) {
    ok(`done: ${formatCommand(command)}`);
    return 0;
  }
  error(result.stderr.trim() || result.stdout.trim() || `${formatCommand(command)} failed`);
  return 1;
}

export async function runReset(): Promise<number> {
  if (currentAppEnv() === "production") {
    error("refusing reset when APP_ENV=production");
    return 1;
  }
  const reset = await runCommandAction(["pnpm", "db:reset"], 120_000);
  if (reset !== 0) {
    return reset;
  }
  return runCommandAction(["pnpm", "storage:seed"], 120_000);
}

export async function runDoctor(): Promise<number> {
  const commands: readonly (readonly string[])[] = [
    ["npx", "expo-doctor"],
    ["pnpm", "i18n:check"],
    ["pnpm", "-r", "outdated"],
    ["pnpm", "audit", "--prod"],
  ];
  let code = 0;
  for (const command of commands) {
    const result = await runCommandAction(command, 120_000);
    if (result !== 0) {
      code = result;
    }
  }
  return code;
}

export function runClean(): number {
  for (const path of [
    rootPath("apps", "web", ".next"),
    rootPath("apps", "mobile", "android"),
    rootPath("apps", "mobile", "ios"),
    rootPath("node_modules", ".cache"),
  ]) {
    if (existsSync(path)) {
      rmSync(path, { recursive: true, force: true });
      ok(`removed ${path}`);
    } else {
      warn(`skip missing ${path}`);
    }
  }
  ok("clean finished; Docker volumes and .env untouched");
  return 0;
}
