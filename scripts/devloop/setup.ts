import { copyFileSync, existsSync } from "node:fs";
import { rootPath, ensureEnvFile, loadRootEnv } from "./env.ts";
import { composeUp } from "./docker.ts";
import { runEnvironmentCheck } from "./check.ts";
import { formatCommand, run } from "./shell.ts";
import { error, info, ok, section, warn } from "./log.ts";

async function runStep(command: readonly string[], timeoutMs: number, tolerateFailure = false): Promise<boolean> {
  info(`run: ${formatCommand(command)}`);
  const result = await run(command, { timeoutMs, streamPrefix: command[1] ?? command[0] });
  if (result.code === 0) {
    ok(`done: ${formatCommand(command)}`);
    return true;
  }
  const detail = result.timedOut ? "timed out" : (result.stderr.trim() || result.stdout.trim() || `exit ${result.code ?? "signal"}`);
  if (tolerateFailure) {
    warn(`${formatCommand(command)} skipped/failed: ${detail}`);
    return false;
  }
  error(`${formatCommand(command)} failed: ${detail}`);
  return false;
}

async function databaseHasDocuments(): Promise<boolean | undefined> {
  const dbName = process.env.MONGODB_DB ?? "agrorende";
  const result = await run([
    "docker",
    "compose",
    "exec",
    "-T",
    "mongo",
    "mongosh",
    dbName,
    "--quiet",
    "--eval",
    "db.getCollectionNames().some((name) => db.getCollection(name).estimatedDocumentCount() > 0) ? 'yes' : 'no'",
  ], { timeoutMs: 15_000 });
  if (result.code !== 0) {
    warn(`seed precheck unavailable: ${result.stderr.trim() || result.stdout.trim() || "mongosh failed"}`);
    return undefined;
  }
  const answer = result.stdout.trim();
  if (answer === "yes") {
    return true;
  }
  if (answer === "no") {
    return false;
  }
  warn(`seed precheck returned unexpected output: ${answer}`);
  return undefined;
}

export async function runDevSetup(): Promise<number> {
  section("Environment file");
  const envStatus = ensureEnvFile();
  if (envStatus === "created") {
    ok("copied .env.example to .env");
  } else if (envStatus === "present") {
    ok(".env already present");
  } else {
    error(".env.example missing");
    return 1;
  }
  loadRootEnv();

  section("Tool versions");
  const preflight = await runEnvironmentCheck();
  if (preflight.failures.some((issue) => issue.label === "Node" || issue.label === "pnpm" || issue.label === "Docker")) {
    warn("continuing only where possible after tool-version failures");
  }

  section("Docker compose");
  const composeError = await composeUp();
  if (composeError !== undefined) {
    error(composeError);
    return 1;
  }
  ok("docker compose up -d completed");

  section("Health gates");
  const health = await runEnvironmentCheck();
  if (health.failures.some((issue) => ["Docker", "MongoDB", "Redis"].includes(issue.label))) {
    warn("compose health is not ready; package setup will be attempted with timeouts");
  }

  section("Workspace setup");
  if (!existsSync(rootPath("node_modules"))) {
    warn("node_modules missing; run pnpm install if commands below fail for missing tools");
  }
  await runStep(["pnpm", "db:migrate"], 60_000, true);
  await runStep(["pnpm", "storage:init"], 30_000, true);
  const hasDocuments = await databaseHasDocuments();
  if (hasDocuments === true) {
    ok("pnpm db:seed skipped: database already contains documents");
  } else {
    await runStep(["pnpm", "db:seed"], 120_000, true);
  }
  await runStep(["pnpm", "storage:seed"], 180_000, true);

  if (!existsSync(rootPath(".env")) && existsSync(rootPath(".env.example"))) {
    copyFileSync(rootPath(".env.example"), rootPath(".env"));
  }
  ok("dev setup finished with graceful skips where packages are not ready");
  return 0;
}
