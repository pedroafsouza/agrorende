import { assertProductionEnv } from "@agrorende/core/startup";

import { readRealtimeConfig } from "./config.js";
import { closeLocationsDb } from "./core.js";
import { createJsonLogger } from "./logger.js";
import { createRealtimeServer } from "./server.js";

assertProductionEnv("realtime");
const logger = createJsonLogger("realtime");
const runtime = createRealtimeServer(readRealtimeConfig(), { logger });

let stopping = false;
function stop(signal: string): void {
  if (stopping) return;
  stopping = true;
  logger.info("realtime.shutdown", { signal });
  const force = setTimeout(() => process.exit(1), 10_000);
  force.unref();
  void runtime
    .stop()
    .then(() => closeLocationsDb())
    .catch((error: unknown) => logger.error("realtime.shutdown_failed", {}, error))
    .finally(() => process.exit(0));
}

process.once("SIGINT", () => stop("SIGINT"));
process.once("SIGTERM", () => stop("SIGTERM"));
process.on("unhandledRejection", (error) => logger.error("realtime.unhandled_rejection", {}, error));

await runtime.start();
