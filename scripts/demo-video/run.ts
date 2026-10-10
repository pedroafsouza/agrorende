/*
 * Entry point of the demo video pipeline: `pnpm exec tsx scripts/demo-video/run.ts [--only stage,stage]`.
 * See docs/DEMO-VIDEO.md for prerequisites and the meaning of each stage.
 */
import { buildAssets } from "./assets.ts";
import { compose, cut } from "./compose.ts";
import { ensureDirs } from "./config.ts";
import { record, RECORDERS, type RecorderName } from "./record.ts";
import { recordTitles } from "./titles.ts";
import { synthesise } from "./tts.ts";

const STAGES = ["assets", "tts", "record", "titles", "compose", "cut"] as const;
type Stage = (typeof STAGES)[number];

async function main(): Promise<void> {
  const onlyIndex = process.argv.indexOf("--only");
  const only = onlyIndex > 0 ? new Set((process.argv[onlyIndex + 1] ?? "").split(",")) : undefined;
  const force = process.argv.includes("--force");
  const want = (stage: Stage): boolean => only === undefined || only.has(stage);
  ensureDirs();
  if (want("assets")) {
    console.log("• assets");
    await buildAssets(force);
  }
  if (want("tts")) {
    console.log("• tts");
    synthesise(force);
  }
  if (want("record")) {
    console.log("• record");
    const recIndex = process.argv.indexOf("--recorders");
    const names = recIndex > 0 ? ((process.argv[recIndex + 1] ?? "").split(",") as RecorderName[]) : [...RECORDERS];
    await record(names);
  }
  if (want("titles")) {
    console.log("• titles");
    await recordTitles();
  }
  if (want("compose")) {
    console.log("• compose");
    await compose();
  }
  if (want("cut")) {
    console.log("• cut");
    cut();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
