import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { loadRootEnv } from "./env.ts";

export interface CommandResult {
  readonly command: readonly string[];
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
}

export interface RunOptions {
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly timeoutMs?: number;
  readonly input?: string;
  readonly streamPrefix?: string;
}

export function formatCommand(command: readonly string[]): string {
  return command.map((part) => (part.includes(" ") ? JSON.stringify(part) : part)).join(" ");
}

export function run(command: readonly string[], options: RunOptions = {}): Promise<CommandResult> {
  const [program, ...args] = command;
  if (program === undefined) {
    return Promise.resolve({ command, code: 1, signal: null, stdout: "", stderr: "Missing command", timedOut: false });
  }
  loadRootEnv();
  const env = options.env === undefined ? process.env : { ...process.env, ...options.env };

  return new Promise((resolve) => {
    const child = spawn(program, args, {
      cwd: options.cwd,
      env,
      stdio: [options.input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;

    const timeout = options.timeoutMs === undefined
      ? undefined
      : setTimeout(() => {
          timedOut = true;
          child.kill("SIGTERM");
          setTimeout(() => {
            if (!settled) {
              child.kill("SIGKILL");
            }
          }, 1_000).unref();
        }, options.timeoutMs);

    const stdoutStream = child.stdout;
    const stderrStream = child.stderr;
    const stdinStream = child.stdin;
    if (stdoutStream === null || stderrStream === null) {
      stderr += "child process stdio unavailable";
      child.kill("SIGTERM");
      return;
    }
    stdoutStream.setEncoding("utf8");
    stderrStream.setEncoding("utf8");
    stdoutStream.on("data", (chunk: string) => {
      stdout += chunk;
      if (options.streamPrefix !== undefined) {
        process.stdout.write(chunk.split(/\r?\n/).filter(Boolean).map((line) => `[${options.streamPrefix}] ${line}\n`).join(""));
      }
    });
    stderrStream.on("data", (chunk: string) => {
      stderr += chunk;
      if (options.streamPrefix !== undefined) {
        process.stderr.write(chunk.split(/\r?\n/).filter(Boolean).map((line) => `[${options.streamPrefix}] ${line}\n`).join(""));
      }
    });
    child.on("error", (err: Error) => {
      stderr += err.message;
    });
    child.on("close", (code, signal) => {
      settled = true;
      if (timeout !== undefined) {
        clearTimeout(timeout);
      }
      resolve({ command, code, signal, stdout, stderr, timedOut });
    });

    if (options.input !== undefined) {
      if (stdinStream !== null) {
        stdinStream.end(options.input);
      }
    }
  });
}

export async function succeeds(command: readonly string[], timeoutMs = 5_000): Promise<boolean> {
  const result = await run(command, { timeoutMs });
  return result.code === 0;
}

export function pathExists(path: string): boolean {
  return existsSync(path);
}
