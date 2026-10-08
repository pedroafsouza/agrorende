import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { detectLanIPv4, readEnvFile, rootPath, writeMobileEnv } from "./env.ts";
import { formatCommand, run } from "./shell.ts";
import { error, info, ok, warn } from "./log.ts";

export function writeLanEnv(): number {
  const address = detectLanIPv4();
  if (address === undefined) {
    error("no LAN IPv4 detected");
    return 1;
  }
  writeMobileEnv(new Map([
    ["EXPO_PUBLIC_API_URL", `http://${address}:3000`],
    ["EXPO_PUBLIC_WS_URL", `http://${address}:4001`],
  ]));
  ok(`apps/mobile/.env points at http://${address}:3000 and http://${address}:4001`);
  info(`QR payload: http://${address}:3000`);
  return 0;
}

export function setMobileTarget(target: "local" | "staging"): number {
  const mobileDir = rootPath("apps", "mobile");
  mkdirSync(mobileDir, { recursive: true });
  if (target === "staging") {
    const staging = join(mobileDir, ".env.staging");
    if (!existsSync(staging)) {
      error("apps/mobile/.env.staging missing");
      return 1;
    }
    copyFileSync(staging, join(mobileDir, ".env"));
    ok("apps/mobile/.env copied from .env.staging");
    return 0;
  }
  const env = readEnvFile(rootPath(".env.example"));
  writeMobileEnv(new Map([
    ["EXPO_PUBLIC_API_URL", env.get("EXPO_PUBLIC_API_URL") ?? "http://localhost:3000"],
    ["EXPO_PUBLIC_WS_URL", env.get("EXPO_PUBLIC_WS_URL") ?? "http://localhost:4001"],
  ]));
  ok("apps/mobile/.env points at local services");
  return 0;
}

async function fingerprintChanged(): Promise<boolean | undefined> {
  const mobileDir = rootPath("apps", "mobile");
  if (!existsSync(mobileDir)) {
    warn("apps/mobile missing; mobile command skipped");
    return undefined;
  }
  const result = await run(["npx", "@expo/fingerprint", mobileDir, "--json"], { timeoutMs: 30_000 });
  if (result.code !== 0) {
    warn(`fingerprint unavailable: ${result.stderr.trim() || result.stdout.trim() || "command failed"}`);
    return false;
  }
  const stateDir = join(mobileDir, ".expo");
  mkdirSync(stateDir, { recursive: true });
  const statePath = join(stateDir, "fingerprint-devloop.json");
  const previous = existsSync(statePath) ? readFileSync(statePath, "utf8") : "";
  if (previous !== result.stdout) {
    writeFileSync(statePath, result.stdout);
    return true;
  }
  return false;
}

export async function runMobile(platform: "android" | "ios", mcp: boolean): Promise<number> {
  const changed = await fingerprintChanged();
  if (changed === undefined) {
    return 0;
  }
  if (changed) {
    warn("native code changed: rebuild the dev client");
    for (const command of [["npx", "expo", "prebuild", "--clean"], ["npx", "expo", `run:${platform}`]] as const) {
      info(`run: ${formatCommand(command)}`);
      const result = await run(command, { cwd: rootPath("apps", "mobile"), timeoutMs: 120_000, streamPrefix: "mobile" });
      if (result.code !== 0) {
        error(result.stderr.trim() || result.stdout.trim() || `${formatCommand(command)} failed`);
        return 1;
      }
    }
    return 0;
  }
  const env = mcp ? { ...process.env, EXPO_UNSTABLE_MCP_SERVER: "1" } : process.env;
  const result = await run(["pnpm", "dev:mobile"], { env, timeoutMs: 30_000, streamPrefix: "metro" });
  if (result.timedOut) {
    ok("Metro started and is still running after readiness window");
    return 0;
  }
  if (result.code === 0) {
    return 0;
  }
  error(result.stderr.trim() || result.stdout.trim() || "pnpm dev:mobile failed");
  return 1;
}
