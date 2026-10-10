/*
 * Text to speech: one audio file per sentence with the macOS `say` voice Luciana (pt-BR), so the
 * captions and the scene lengths come from measured durations.
 */
import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { paths } from "./config.ts";
import { allScenes } from "./script.pt-BR.ts";

export const VOICE = process.env.DEMO_VOICE ?? "Luciana";
export const RATE = Number(process.env.DEMO_RATE ?? "165");
/** Silence after each sentence and around each scene, in seconds. */
export const SENTENCE_GAP = 0.35;
export const SCENE_LEAD = 0.35;
export const SCENE_TAIL = 0.45;

export interface SentenceAudio {
  readonly file: string;
  readonly text: string;
  readonly duration: number;
}

export interface SceneAudio {
  readonly id: string;
  readonly sentences: readonly SentenceAudio[];
  /** Total scene length: lead + sentences + gaps + tail. */
  readonly duration: number;
}

export function probeDuration(file: string): number {
  const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file]).toString().trim();
  return Number(out);
}

export function synthesise(force = false): SceneAudio[] {
  const result: SceneAudio[] = [];
  for (const scene of allScenes()) {
    const sentences: SentenceAudio[] = scene.sentences.map((text, index) => {
      const base = join(paths.tts, `${scene.id}-${String(index + 1).padStart(2, "0")}`);
      const wav = `${base}.wav`;
      if (force || !existsSync(wav)) {
        execFileSync("say", ["-v", VOICE, "-r", String(RATE), "-o", `${base}.aiff`, text]);
        execFileSync("ffmpeg", ["-y", "-v", "error", "-i", `${base}.aiff`, "-ar", "48000", "-ac", "2", wav]);
      }
      return { file: wav, text, duration: probeDuration(wav) };
    });
    const speech = sentences.reduce((sum, s) => sum + s.duration, 0) + SENTENCE_GAP * (sentences.length - 1);
    result.push({ id: scene.id, sentences, duration: SCENE_LEAD + speech + SCENE_TAIL });
  }
  writeFileSync(join(paths.tts, "durations.json"), JSON.stringify(result, null, 2));
  const total = result.reduce((sum, s) => sum + s.duration, 0);
  console.log(`  narration: ${result.length} scenes, ${total.toFixed(1)} s`);
  return result;
}
