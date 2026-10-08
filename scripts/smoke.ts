import { run } from "./devloop/shell.ts";
import { fetchHealth } from "./devloop/probes.ts";
import { error, ok, section, warn } from "./devloop/log.ts";
import { loadRootEnv } from "./devloop/env.ts";

async function checkHttp(label: string, urls: readonly string[]): Promise<boolean> {
  for (const url of urls) {
    const result = await fetchHealth(url, 4_000);
    if (result.ok) {
      ok(`${label}: ${url} -> ${result.detail}`);
      return true;
    }
    warn(`${label}: ${url} -> ${result.detail}`);
  }
  error(`${label}: no health endpoint responded`);
  return false;
}

async function checkCommand(label: string, command: readonly string[]): Promise<boolean> {
  const result = await run(command, { timeoutMs: 8_000 });
  if (result.code === 0) {
    ok(`${label}: reachable`);
    return true;
  }
  error(`${label}: ${result.stderr.trim() || result.stdout.trim() || `exit ${result.code ?? "signal"}`}`);
  return false;
}

async function main(): Promise<number> {
  loadRootEnv();
  section("smoke");
  const results = await Promise.all([
    checkHttp("web", ["http://localhost:3000/api/health", "http://localhost:3000/health", "http://localhost:3000"]),
    checkHttp("realtime", ["http://localhost:4001/health", "http://localhost:4001/api/health"]),
    checkHttp("worker", ["http://localhost:4002/health", "http://localhost:4002/api/health"]),
    checkCommand("MongoDB", ["docker", "compose", "exec", "-T", "mongo", "mongosh", "--quiet", "--eval", "db.runCommand({ ping: 1 }).ok"]),
    checkCommand("Redis", ["docker", "compose", "exec", "-T", "redis", "redis-cli", "ping"]),
  ]);
  
  return results.every(Boolean) ? 0 : 1;
}

void main().then((code) => { process.exitCode = code; });
