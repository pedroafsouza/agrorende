const encoder = new TextEncoder();

function write(stream: NodeJS.WriteStream, line: string): void {
  stream.write(encoder.encode(`${line}\n`));
}

export type LogLevel = "info" | "ok" | "warn" | "error";

export function log(level: LogLevel, message: string): void {
  const label = level === "ok" ? "ok" : level;
  const stream = level === "error" ? process.stderr : process.stdout;
  write(stream, `[devloop:${label}] ${message}`);
}

export function info(message: string): void {
  log("info", message);
}

export function ok(message: string): void {
  log("ok", message);
}

export function warn(message: string): void {
  log("warn", message);
}

export function error(message: string): void {
  log("error", message);
}

export function section(title: string): void {
  write(process.stdout, `
== ${title} ==`);
}

export function prefix(name: string, chunk: string): string {
  return chunk
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map((line) => `[${name}] ${line}`)
    .join("\n");
}
