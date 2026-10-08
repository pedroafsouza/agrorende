import { spawn } from "node:child_process";
import { prefix } from "./log.ts";

export interface SupervisedProcess {
  readonly name: string;
  readonly stop: () => void;
}

export function supervise(name: string, command: readonly string[], env: NodeJS.ProcessEnv = process.env): SupervisedProcess {
  const [program, ...args] = command;
  if (program === undefined) {
    throw new Error("Missing command");
  }
  const child = spawn(program, args, { env, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => process.stdout.write(`${prefix(name, chunk)}
`));
  child.stderr.on("data", (chunk: string) => process.stderr.write(`${prefix(name, chunk)}
`));
  return {
    name,
    stop: () => child.kill("SIGTERM"),
  };
}
