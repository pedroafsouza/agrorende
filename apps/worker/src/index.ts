import { readWorkerConfig } from "./config.js";
import { createWorkerHealthServer } from "./health.js";
import { createWorkerRuntime } from "./queues.js";

const config = readWorkerConfig();
const runtime = createWorkerRuntime(config.redisUrl);
const health = createWorkerHealthServer(config.healthPort, config.redisUrl);

function stop(): void {
  const timer = setTimeout(() => {
    process.exit(1);
  }, config.shutdownGraceMs);
  timer.unref();
  void Promise.all([runtime.stop(), health.stop()]).finally(() => {
    clearTimeout(timer);
    process.exit(0);
  });
}

process.once("SIGINT", stop);
process.once("SIGTERM", stop);

await Promise.all([runtime.start(), health.start()]);
