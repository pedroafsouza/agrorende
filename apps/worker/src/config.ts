export interface WorkerConfig {
  readonly redisUrl: string;
  readonly shutdownGraceMs: number;
  readonly healthPort: number;
}

function readRequiredEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

export function readWorkerConfig(): WorkerConfig {
  return {
    redisUrl: readRequiredEnv("REDIS_URL"),
    shutdownGraceMs: Number.parseInt(process.env.WORKER_SHUTDOWN_GRACE_MS ?? "10000", 10),
    healthPort: Number.parseInt(process.env.WORKER_HEALTH_PORT ?? "4002", 10),
  };
}
