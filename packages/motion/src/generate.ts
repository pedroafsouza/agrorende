import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildAll, serialize } from "./animations/registry.js";

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "lottie");
mkdirSync(outDir, { recursive: true });

for (const [id, json] of Object.entries(buildAll())) {
  const text = serialize(json);
  writeFileSync(join(outDir, `${id}.json`), text);
  process.stdout.write(`lottie/${id}.json ${(Buffer.byteLength(text) / 1024).toFixed(1)} KB\n`);
}
