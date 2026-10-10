/*
 * Text to speech: one audio file per sentence, so the captions and the scene lengths come from
 * measured durations. The engine is pluggable (docs/DEMO-VIDEO.md, "Narration voice"):
 *
 * - `kokoro`: Kokoro-82M, a local neural voice (default; free, offline after the first download).
 * - `elevenlabs`: ElevenLabs text to speech, when `ELEVENLABS_API_KEY` is set.
 * - `openai`: OpenAI `gpt-4o-mini-tts`, when `OPENAI_API_KEY` is set.
 * - `say`: the legacy macOS voice Luciana.
 *
 * API keys are only ever read from the environment and sent in request headers; they are never
 * written to disk, logged or included in error messages.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { paths } from "./config.ts";
import { allScenes, PRONUNCIATION } from "./script.pt-BR.ts";

export const ENGINES = ["kokoro", "elevenlabs", "openai", "say"] as const;
export type Engine = (typeof ENGINES)[number];

/** Silence after each sentence and around each scene, in seconds. Kept short for a brisk pace. */
export const SENTENCE_GAP = 0.22;
export const SCENE_LEAD = 0.25;
export const SCENE_TAIL = 0.4;

export const KOKORO_PYTHON = process.env.DEMO_KOKORO_PYTHON ?? join(paths.root, ".data", "tts-venv", "bin", "python");
const KOKORO_SCRIPT = join(paths.root, "scripts", "demo-video", "kokoro_tts.py");
export const KOKORO_SETUP = "scripts/demo-video/setup-kokoro.sh";

const OPENAI_INSTRUCTIONS =
  "Brazilian Portuguese narrator for farm owners, managers and technicians. Energetic and fast-paced like a good tech explainer, but warm, confident and respectful; natural and conversational, never robotic, never hype, no irony.";

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

export interface Voice {
  readonly engine: Engine;
  readonly voice: string;
  /** Speaking speed multiplier (1 = engine default); for `say`, words per minute. */
  readonly speed: number;
  /** Engine model, where the engine has more than one. */
  readonly model: string;
}

function isEngine(value: string): value is Engine {
  return (ENGINES as readonly string[]).includes(value);
}

function kokoroReady(): boolean {
  return existsSync(KOKORO_PYTHON);
}

function kokoroMissing(): string {
  return `The Kokoro voice needs a local Python environment at ${KOKORO_PYTHON}. Create it once with:\n  ${KOKORO_SETUP}\n(or pick another engine with DEMO_TTS=elevenlabs|openai|say).`;
}

/** Engine choice: explicit DEMO_TTS, then an ElevenLabs key, then an OpenAI key, then Kokoro, then `say`. */
export function pickEngine(env: NodeJS.ProcessEnv = process.env): Engine {
  const explicit = env.DEMO_TTS?.trim().toLowerCase();
  if (explicit !== undefined && explicit !== "") {
    if (!isEngine(explicit)) throw new Error(`DEMO_TTS must be one of ${ENGINES.join(", ")}; got "${explicit}".`);
    return explicit;
  }
  if ((env.ELEVENLABS_API_KEY ?? "") !== "") return "elevenlabs";
  if ((env.OPENAI_API_KEY ?? "") !== "") return "openai";
  if (kokoroReady()) return "kokoro";
  console.warn(`  ! ${kokoroMissing()}\n  ! Falling back to the robotic macOS voice.`);
  return "say";
}

export function resolveVoice(env: NodeJS.ProcessEnv = process.env): Voice {
  const engine = pickEngine(env);
  const voice = env.DEMO_VOICE;
  const speed = env.DEMO_SPEED === undefined ? undefined : Number(env.DEMO_SPEED);
  switch (engine) {
    case "kokoro":
      return { engine, voice: voice ?? "pm_alex", speed: speed ?? 1.12, model: "Kokoro-82M" };
    case "elevenlabs":
      // Default: "Lucas - Engaging, Captivating and Kind", a native pt-BR voice from the ElevenLabs voice library.
      return { engine, voice: voice ?? "7lu3ze7orhWaNeSPowWx", speed: speed ?? 1.1, model: env.DEMO_ELEVENLABS_MODEL ?? "eleven_multilingual_v2" };
    case "openai":
      return { engine, voice: voice ?? "ash", speed: speed ?? 1.1, model: env.DEMO_OPENAI_MODEL ?? "gpt-4o-mini-tts" };
    case "say":
      return { engine, voice: voice ?? "Luciana", speed: Number(env.DEMO_RATE ?? "165"), model: "say" };
  }
}

/** Text sent to the engine: the pronunciation fixes apply to speech only, captions keep the written text. */
export function spokenText(text: string): string {
  return PRONUNCIATION.reduce((out, [pattern, replacement]) => out.replace(pattern, replacement), text);
}

/** Short content hash of the engine, model, voice, speed and spoken sentence, so nothing stale is ever served from cache. */
export function ttsCacheKey(v: Voice, text: string): string {
  return createHash("sha256").update([v.engine, v.model, v.voice, String(v.speed), text].join("\u0000")).digest("hex").slice(0, 12);
}

export function probeDuration(file: string): number {
  const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file]).toString().trim();
  return Number(out);
}

/** Any engine output to the 48 kHz stereo WAV the composer expects. */
function toWav(source: string, wav: string): void {
  execFileSync("ffmpeg", ["-y", "-v", "error", "-i", source, "-ar", "48000", "-ac", "2", wav]);
}

interface Job {
  readonly spoken: string;
  /** Neighbouring sentences of the same scene, so a cloud voice keeps the intonation flowing. */
  readonly previous: string | undefined;
  readonly next: string | undefined;
  readonly base: string;
  readonly wav: string;
}

function runKokoro(v: Voice, jobs: readonly Job[]): void {
  if (!kokoroReady()) throw new Error(kokoroMissing());
  const request = { voice: v.voice, speed: v.speed, lang: v.voice.startsWith("p") ? "p" : v.voice[0], items: jobs.map((j) => ({ text: j.spoken, out: `${j.base}.src.wav` })) };
  console.log(`  kokoro: ${jobs.length} sentences with ${v.voice} at ${v.speed}x`);
  const result = spawnSync(KOKORO_PYTHON, [KOKORO_SCRIPT], { input: JSON.stringify(request), stdio: ["pipe", "ignore", "pipe"], maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) {
    const stderr = result.stderr.toString().split("\n").filter((l) => l.trim() !== "" && !l.includes("HF_TOKEN")).slice(-15).join("\n");
    throw new Error(`Kokoro failed (exit ${String(result.status)}):\n${stderr}\nIf the environment is broken, recreate it with ${KOKORO_SETUP}.`);
  }
  for (const j of jobs) toWav(`${j.base}.src.wav`, j.wav);
}

async function postAudio(url: string, headers: Record<string, string>, body: unknown, out: string, engine: string): Promise<void> {
  for (let attempt = 1; ; attempt += 1) {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
    if (res.ok) {
      writeFileSync(out, Buffer.from(await res.arrayBuffer()));
      return;
    }
    const detail = (await res.text()).slice(0, 300);
    if ((res.status === 429 || res.status >= 500) && attempt < 4) {
      await new Promise((r) => setTimeout(r, 2000 * attempt));
      continue;
    }
    throw new Error(`${engine} text to speech failed with HTTP ${res.status}: ${detail}`);
  }
}

function requireKey(name: "ELEVENLABS_API_KEY" | "OPENAI_API_KEY"): string {
  const key = process.env[name] ?? "";
  if (key === "") throw new Error(`${name} is not set; export it in your shell (never commit it) or choose another DEMO_TTS engine.`);
  return key;
}

async function runElevenLabs(v: Voice, job: Job): Promise<void> {
  const key = requireKey("ELEVENLABS_API_KEY");
  const mp3 = `${job.base}.mp3`;
  await postAudio(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(v.voice)}?output_format=mp3_44100_128`,
    { "xi-api-key": key, accept: "audio/mpeg" },
    { text: job.spoken, model_id: v.model, previous_text: job.previous, next_text: job.next, voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.3, use_speaker_boost: true, speed: Math.min(1.2, Math.max(0.7, v.speed)) } },
    mp3,
    "ElevenLabs",
  );
  toWav(mp3, job.wav);
}

async function runOpenAi(v: Voice, job: Job): Promise<void> {
  const key = requireKey("OPENAI_API_KEY");
  const src = `${job.base}.src.wav`;
  await postAudio(
    "https://api.openai.com/v1/audio/speech",
    { authorization: `Bearer ${key}` },
    { model: v.model, voice: v.voice, input: job.spoken, instructions: OPENAI_INSTRUCTIONS, response_format: "wav", speed: v.speed },
    src,
    "OpenAI",
  );
  toWav(src, job.wav);
}

function runSay(v: Voice, job: Job): void {
  execFileSync("say", ["-v", v.voice, "-r", String(v.speed), "-o", `${job.base}.aiff`, job.spoken]);
  toWav(`${job.base}.aiff`, job.wav);
}

export async function synthesise(force = false): Promise<SceneAudio[]> {
  const v = resolveVoice();
  console.log(`  voice: ${v.engine} / ${v.voice} / ${v.model} / speed ${v.speed}`);
  const scenes = allScenes().map((scene) => ({
    id: scene.id,
    sentences: scene.sentences.map((text, index, all) => {
      const spoken = spokenText(text);
      const base = join(paths.tts, `${scene.id}-${String(index + 1).padStart(2, "0")}-${v.engine}-${ttsCacheKey(v, spoken)}`);
      const previous = index > 0 ? spokenText(all[index - 1] ?? "") : undefined;
      const next = index < all.length - 1 ? spokenText(all[index + 1] ?? "") : undefined;
      return { text, job: { spoken, base, wav: `${base}.wav`, previous, next } satisfies Job };
    }),
  }));
  const todo = scenes.flatMap((s) => s.sentences.map((x) => x.job)).filter((j) => force || !existsSync(j.wav));
  if (todo.length > 0) {
    if (v.engine === "kokoro") runKokoro(v, todo);
    for (const job of v.engine === "kokoro" ? [] : todo) {
      if (v.engine === "elevenlabs") await runElevenLabs(v, job);
      else if (v.engine === "openai") await runOpenAi(v, job);
      else runSay(v, job);
    }
  }
  const result: SceneAudio[] = scenes.map((scene) => {
    const sentences = scene.sentences.map(({ text, job }) => ({ file: job.wav, text, duration: probeDuration(job.wav) }));
    const speech = sentences.reduce((sum, s) => sum + s.duration, 0) + SENTENCE_GAP * (sentences.length - 1);
    return { id: scene.id, sentences, duration: SCENE_LEAD + speech + SCENE_TAIL };
  });
  writeFileSync(join(paths.tts, "durations.json"), JSON.stringify(result, null, 2));
  const total = result.reduce((sum, s) => sum + s.duration, 0);
  console.log(`  narration: ${result.length} scenes, ${total.toFixed(1)} s (${todo.length} sentences synthesised)`);
  return result;
}
