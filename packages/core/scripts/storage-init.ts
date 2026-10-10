import { initStorage } from "../src/storage/init";

async function main(): Promise<void> {
  const result = await initStorage();
  process.stdout.write(`storage root: ${result.root}\ncreated: ${result.created.length}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
