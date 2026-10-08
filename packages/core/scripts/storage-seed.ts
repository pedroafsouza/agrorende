import { seedStorage } from "../src/storage/seed.js";
import { closeClient } from "@agrorende/db";

async function main(): Promise<void> {
  const result = await seedStorage();
  process.stdout.write(`storage seeded: ${result.seeded}\nskipped: ${result.skipped}\n`);
}

main()
  .finally(closeClient)
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
