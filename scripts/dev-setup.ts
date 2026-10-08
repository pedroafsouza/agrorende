import { runDevSetup } from "./devloop/setup.ts";

void runDevSetup().then((code) => { process.exitCode = code; });
