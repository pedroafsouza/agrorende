import { readRealtimeConfig } from "./config.js";
import { createRealtimeServer } from "./server.js";

const runtime = createRealtimeServer(readRealtimeConfig());

function stop(): void {
  void runtime.stop().finally(() => {
    process.exit(0);
  });
}

process.once("SIGINT", stop);
process.once("SIGTERM", stop);

await runtime.start();
