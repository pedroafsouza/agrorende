import { run } from "./shell.ts";

export async function dockerAvailable(): Promise<string | undefined> {
  const result = await run(["docker", "info", "--format", "{{.ServerVersion}}"], { timeoutMs: 8_000 });
  if (result.code !== 0) {
    return result.stderr.trim() || result.stdout.trim() || "docker info failed";
  }
  return undefined;
}

export async function composeUp(): Promise<string | undefined> {
  const result = await run(["docker", "compose", "up", "-d"], { timeoutMs: 60_000, streamPrefix: "compose" });
  if (result.code !== 0) {
    return result.stderr.trim() || result.stdout.trim() || "docker compose up -d failed";
  }
  return undefined;
}

export async function composePsText(): Promise<string> {
  const result = await run(["docker", "compose", "ps"], { timeoutMs: 8_000 });
  return `${result.stdout}
${result.stderr}`;
}

export async function serviceOwnsPort(port: number): Promise<boolean> {
  const text = await composePsText();
  return text.includes(`:${port}->`) || text.includes(`0.0.0.0:${port}`) || text.includes(`127.0.0.1:${port}`);
}

export async function mongoHealthy(): Promise<string | undefined> {
  const result = await run([
    "docker",
    "compose",
    "exec",
    "-T",
    "mongo",
    "mongosh",
    "--quiet",
    "--eval",
    "try { const status = rs.status(); status.ok === 1 ? 'ok' : JSON.stringify(status) } catch (e) { String(e) }",
  ], { timeoutMs: 12_000 });
  if (result.code !== 0) {
    return result.stderr.trim() || result.stdout.trim() || "mongosh health check failed";
  }
  return result.stdout.trim() === "ok" ? undefined : result.stdout.trim();
}

export async function redisHealthy(): Promise<string | undefined> {
  const result = await run(["docker", "compose", "exec", "-T", "redis", "redis-cli", "ping"], { timeoutMs: 8_000 });
  if (result.code !== 0) {
    return result.stderr.trim() || result.stdout.trim() || "redis-cli ping failed";
  }
  return result.stdout.trim() === "PONG" ? undefined : result.stdout.trim();
}
