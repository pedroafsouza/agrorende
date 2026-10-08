export interface RealtimeConfig {
  readonly port: number;
  readonly corsOrigins: readonly string[];
  readonly redisUrl: string;
  readonly jwtSecret: string;
  readonly mongoDbName: string;
}

function readRequiredEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

function readPort(): number {
  const raw = process.env.REALTIME_PORT ?? "4001";
  const port = Number.parseInt(raw, 10);
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new Error("REALTIME_PORT must be a valid TCP port");
  }
  return port;
}

function readCorsOrigins(): readonly string[] {
  const raw = process.env.REALTIME_CORS_ORIGINS ?? "";
  return raw
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

export function readRealtimeConfig(): RealtimeConfig {
  return {
    port: readPort(),
    corsOrigins: readCorsOrigins(),
    redisUrl: readRequiredEnv("REDIS_URL"),
    jwtSecret: readRequiredEnv("JWT_SECRET"),
    mongoDbName: process.env.MONGODB_DB ?? "agrorende",
  };
}
