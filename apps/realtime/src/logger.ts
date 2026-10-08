import type { Logger, LogLevel } from "@agrorende/core";

/**
 * Structured JSON logger. Callers pass identifiers and error codes only — never tokens,
 * coordinates, names or payload bodies (ARCHITECTURE §19, telemetry-safe logging).
 */
export function createJsonLogger(service: string, write: (line: string) => void = (line) => process.stdout.write(line)): Logger {
  const log = (level: LogLevel, message: string, context?: Readonly<Record<string, unknown>>, error?: unknown): void => {
    const record: Record<string, unknown> = { time: new Date().toISOString(), level, service, message, ...context };
    if (error !== undefined) {
      record.error = error instanceof Error ? { name: error.name, message: error.message } : "unknown";
    }
    write(`${JSON.stringify(record)}\n`);
  };
  return {
    debug: (message, context) => log("debug", message, context),
    info: (message, context) => log("info", message, context),
    warn: (message, context) => log("warn", message, context),
    error: (message, context, error) => log("error", message, context, error),
  };
}
