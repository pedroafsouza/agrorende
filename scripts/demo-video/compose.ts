/*
 * Composer: turns the recordings, title cards and narration into the final video and captions.
 *
 * Every scene becomes one H.264 clip that lasts exactly as long as its narration (rounded to whole
 * frames). A recording that is shorter than the narration holds its last frame; a longer one is sped
 * up (at most 2.5x, then trimmed). The clips and the per-scene audio are then concatenated, the
 * narration is loudness-normalised, and WebVTT captions are written from the measured sentence times.
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { PHONE_BEZEL, PHONE_FRAME } from "./assets.ts";
import { brand, paths } from "./config.ts";
import { launch, renderHtml } from "./lib/browser.ts";
import { DESKTOP, PHONE } from "./record.ts";
import { CHAPTERS, allScenes, type Scene } from "./script.pt-BR.ts";
import { SCENE_LEAD, SENTENCE_GAP, type SceneAudio } from "./tts.ts";

const FPS = 30;
const MAX_SPEED = 2.5;

type Marks = Record<string, Record<string, number>>;

interface Cue {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

function ffmpeg(args: readonly string[]): void {
  execFileSync("ffmpeg", ["-y", "-v", "error", ...args], { stdio: ["ignore", "inherit", "inherit"] });
}

function frames(seconds: number): number {
  return Math.ceil(seconds * FPS) / FPS;
}

function segment(marks: Marks, source: string, mark: string): { start: number; length: number } {
  const m = marks[source];
  const start = m?.[mark];
  const end = m?.[`${mark}/end`];
  if (start === undefined || end === undefined) throw new Error(`Missing marks ${source}:${mark}; record "${source}" first.`);
  return { start, length: end - start };
}

/** Video filter that maps a recording of `length` seconds onto `duration` seconds. */
function fit(length: number, duration: number): { inputLength: number; filter: string } {
  if (length <= duration) {
    return { inputLength: length, filter: `setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration=${(duration - length + 1).toFixed(3)}` };
  }
  const speed = Math.min(length / duration, MAX_SPEED);
  return { inputLength: Math.min(length, duration * speed), filter: `setpts=(PTS-STARTPTS)/${speed.toFixed(4)}` };
}

const ENCODE = ["-r", String(FPS), "-c:v", "libx264", "-preset", "veryfast", "-crf", "17", "-pix_fmt", "yuv420p", "-an"];

function chapterOf(scene: Scene): string {
  return CHAPTERS.find((c) => c.scenes.includes(scene))?.title ?? "";
}

function backgroundHtml(eyebrow: string, caption: string, layout: "phone" | "split"): string {
  const logo = readFileSync(paths.logoSvg, "utf8");
  const text =
    layout === "phone"
      ? `<div style="position:absolute;left:900px;top:0;bottom:0;width:860px;display:flex;flex-direction:column;justify-content:center">
           <div style="font-size:30px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${brand.terra600}">${eyebrow}</div>
           <div style="margin-top:20px;font-size:84px;line-height:1.05;font-weight:800;letter-spacing:-.02em">${caption}</div>
         </div>`
      : `<div style="position:absolute;left:660px;top:70px;right:60px">
           <div style="font-size:26px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${brand.terra600}">${eyebrow}</div>
           <div style="margin-top:10px;font-size:56px;line-height:1.05;font-weight:800">${caption}</div>
         </div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
      * { margin: 0; box-sizing: border-box; }
      body { width: 1920px; height: 1080px; overflow: hidden; color: ${brand.graphite900};
        font-family: Inter, "SF Pro Display", -apple-system, "Helvetica Neue", Arial, sans-serif;
        background: radial-gradient(1100px 800px at 25% 50%, ${brand.mata50} 0%, #F6F8F6 60%, #EEF2EE 100%); }
      .logo { position: absolute; right: 60px; bottom: 44px; } .logo svg { height: 44px; width: auto; }
      .bar { position: absolute; left: 0; right: 0; bottom: 0; height: 10px; background: linear-gradient(90deg, ${brand.mata600} 0 70%, ${brand.terra600} 70% 100%); }
      .office { position: absolute; left: 640px; top: 214px; width: 1240px; height: 698px; border-radius: 14px; background: #fff;
        box-shadow: 0 24px 60px rgba(28,31,35,.18), 0 0 0 1px rgba(28,31,35,.08); }
    </style></head><body>${text}${layout === "split" ? '<div class="office"></div>' : ""}<div class="logo">${logo}</div><div class="bar"></div></body></html>`;
}

const PHONE_X = { phone: 330, split: 120 } as const;
const PHONE_Y = Math.round((1080 - PHONE_FRAME.frameH) / 2);
const OFFICE_BOX = { x: 640, y: 214, w: 1240, h: 698 } as const;

export async function compose(): Promise<void> {
  const audio = JSON.parse(readFileSync(join(paths.tts, "durations.json"), "utf8")) as SceneAudio[];
  const audioById = new Map(audio.map((a) => [a.id, a]));
  const marks = JSON.parse(readFileSync(paths.marks, "utf8")) as Marks;
  const titleMarks = JSON.parse(readFileSync(join(paths.raw, "title-marks.json"), "utf8")) as Record<string, number>;
  mkdirSync(paths.clips, { recursive: true });

  const browser = await launch();
  const scenes = allScenes();
  const cues: Cue[] = [];
  const timeline: Array<{ id: string; start: number; duration: number }> = [];
  let clock = 0;
  try {
    for (const scene of scenes) {
      const a = audioById.get(scene.id);
      if (a === undefined) throw new Error(`No narration for ${scene.id}; run the tts stage.`);
      const duration = frames(a.duration);
      const clip = join(paths.clips, `${scene.id}.mp4`);
      const sceneWav = join(paths.clips, `${scene.id}.wav`);
      const v = scene.visual;

      if (v.kind === "title") {
        const t = titleMarks[scene.id] ?? 0.5;
        ffmpeg(["-ss", t.toFixed(3), "-t", (duration + 0.5).toFixed(3), "-i", join(paths.raw, `title-${scene.id}.webm`), "-vf", "fps=30,setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration=1", "-t", duration.toFixed(3), ...ENCODE, clip]);
      } else if (v.kind === "clip") {
        const seg = segment(marks, v.source, v.mark);
        const f = fit(seg.length, duration);
        ffmpeg(["-ss", seg.start.toFixed(3), "-t", f.inputLength.toFixed(3), "-i", join(paths.raw, `${v.source}.webm`),
          "-vf", `crop=${DESKTOP.width}:${DESKTOP.height}:0:0,scale=1920:1080:flags=lanczos,fps=30,${f.filter}`, "-t", duration.toFixed(3), ...ENCODE, clip]);
      } else {
        const layout = v.kind === "phone" ? "phone" : "split";
        const phoneSource = v.kind === "phone" ? v.source : v.phone;
        const bg = join(paths.clips, `${scene.id}-bg.png`);
        await renderHtml(browser, backgroundHtml(chapterOf(scene), v.caption ?? "", layout), bg, { width: 1920, height: 1080 });
        const seg = segment(marks, phoneSource, v.mark);
        const f = fit(seg.length, duration);
        const px = PHONE_X[layout];
        const phoneChain = `[1:v]crop=${PHONE.width}:${PHONE.height}:0:0,scale=${PHONE_FRAME.screenW}:${PHONE_FRAME.screenH}:flags=lanczos,fps=30,${f.filter}[p]`;
        const inputs = ["-loop", "1", "-i", bg, "-ss", seg.start.toFixed(3), "-t", f.inputLength.toFixed(3), "-i", join(paths.raw, `${phoneSource}.webm`)];
        let graph: string;
        if (v.kind === "split") {
          const officeSeg = segment(marks, v.office, v.mark);
          const g = fit(officeSeg.length, duration);
          inputs.push("-ss", officeSeg.start.toFixed(3), "-t", g.inputLength.toFixed(3), "-i", join(paths.raw, `${v.office}.webm`), "-i", PHONE_BEZEL);
          graph = `${phoneChain};[2:v]crop=${DESKTOP.width}:${DESKTOP.height}:0:0,scale=${OFFICE_BOX.w}:${OFFICE_BOX.h}:flags=lanczos,fps=30,${g.filter}[o];` +
            `[0:v][o]overlay=${OFFICE_BOX.x}:${OFFICE_BOX.y}[b1];[b1][p]overlay=${px + PHONE_FRAME.border}:${PHONE_Y + PHONE_FRAME.border}[b2];[b2][3:v]overlay=${px}:${PHONE_Y}[out]`;
        } else {
          inputs.push("-i", PHONE_BEZEL);
          graph = `${phoneChain};[0:v][p]overlay=${px + PHONE_FRAME.border}:${PHONE_Y + PHONE_FRAME.border}[b1];[b1][2:v]overlay=${px}:${PHONE_Y}[out]`;
        }
        ffmpeg([...inputs, "-filter_complex", graph, "-map", "[out]", "-t", duration.toFixed(3), ...ENCODE, clip]);
      }

      // Scene audio: lead silence, sentences with gaps, then silence up to the frame-rounded length.
      const args: string[] = [];
      const parts: string[] = [];
      let n = 0;
      const silence = (seconds: number): void => {
        args.push("-f", "lavfi", "-t", seconds.toFixed(3), "-i", "anullsrc=r=48000:cl=stereo");
        parts.push(`[${n}:a]`);
        n += 1;
      };
      silence(SCENE_LEAD);
      let at = clock + SCENE_LEAD;
      a.sentences.forEach((s, i) => {
        if (i > 0) {
          silence(SENTENCE_GAP);
          at += SENTENCE_GAP;
        }
        args.push("-i", s.file);
        parts.push(`[${n}:a]`);
        n += 1;
        cues.push({ start: at, end: at + s.duration, text: s.text });
        at += s.duration;
      });
      ffmpeg([...args, "-filter_complex", `${parts.join("")}concat=n=${n}:v=0:a=1,apad,atrim=0:${duration.toFixed(3)}[a]`, "-map", "[a]", "-ar", "48000", "-ac", "2", sceneWav]);
      timeline.push({ id: scene.id, start: clock, duration });
      clock += duration;
      console.log(`  clip ${scene.id} ${duration.toFixed(2)}s`);
    }
  } finally {
    await browser.close();
  }

  writeFileSync(join(paths.clips, "timeline.json"), JSON.stringify({ timeline, cues }, null, 2));
  render(scenes.map((s) => s.id), paths.finalMp4, { width: 1920, height: 1080, crf: 20, preset: "medium" });
  writeFileSync(paths.finalVtt, vtt(cues));
  console.log(`  ${paths.finalMp4} ${clock.toFixed(1)}s`);
}

function render(ids: readonly string[], out: string, opts: { width: number; height: number; crf: number; preset: string; maxrate?: string; audioBitrate?: string }): void {
  const videoList = join(paths.clips, `${ids.length}-${opts.width}-video.txt`);
  const audioList = join(paths.clips, `${ids.length}-${opts.width}-audio.txt`);
  writeFileSync(videoList, ids.map((id) => `file '${join(paths.clips, `${id}.mp4`)}'`).join("\n"));
  writeFileSync(audioList, ids.map((id) => `file '${join(paths.clips, `${id}.wav`)}'`).join("\n"));
  const vf = opts.width === 1920 ? "null" : `scale=${opts.width}:${opts.height}:flags=lanczos`;
  ffmpeg([
    "-f", "concat", "-safe", "0", "-i", videoList,
    "-f", "concat", "-safe", "0", "-i", audioList,
    "-map", "0:v", "-map", "1:a",
    "-vf", vf,
    "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
    "-c:v", "libx264", "-preset", opts.preset, "-crf", String(opts.crf), "-pix_fmt", "yuv420p", "-r", String(FPS),
    ...(opts.maxrate === undefined ? [] : ["-maxrate", opts.maxrate, "-bufsize", "2M"]),
    "-c:a", "aac", "-b:a", opts.audioBitrate ?? "160k", "-ar", "48000",
    "-movflags", "+faststart", "-shortest", out,
  ]);
}

function stamp(seconds: number): string {
  const ms = Math.round(seconds * 1000);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const r = ms % 1000;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(r).padStart(3, "0")}`;
}

function vtt(cues: readonly Cue[]): string {
  return `WEBVTT\n\n${cues.map((c, i) => `${i + 1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${c.text}\n`).join("\n")}`;
}

/** The ~3-minute highlights cut for the landing page: the scenes flagged `highlight`, 720p, at most 12 MB. */
export function cut(): void {
  const { timeline, cues } = JSON.parse(readFileSync(join(paths.clips, "timeline.json"), "utf8")) as {
    timeline: Array<{ id: string; start: number; duration: number }>;
    cues: Cue[];
  };
  const wanted = new Set(allScenes().filter((s) => s.highlight === true).map((s) => s.id));
  const picked = timeline.filter((t) => wanted.has(t.id));
  const cutCues: Cue[] = [];
  let clock = 0;
  for (const t of picked) {
    for (const c of cues) {
      if (c.start >= t.start && c.end <= t.start + t.duration + 0.01) cutCues.push({ start: c.start - t.start + clock, end: c.end - t.start + clock, text: c.text });
    }
    clock += t.duration;
  }
  mkdirSync(paths.landingDir, { recursive: true });
  const mp4 = join(paths.landingDir, "agrorende-demo-pt-BR.mp4");
  // Bitrate budget: 12 MB minus audio, spread over the cut, with a safety margin.
  const videoKbps = Math.floor(((11.2 * 8 * 1024) / clock) - 64);
  render(picked.map((t) => t.id), mp4, { width: 1280, height: 720, crf: 21, preset: "slow", maxrate: `${videoKbps}k`, audioBitrate: "64k" });
  writeFileSync(join(paths.landingDir, "agrorende-demo-pt-BR.vtt"), vtt(cutCues));
  ffmpeg(["-ss", "2", "-i", join(paths.clips, `${picked[0]?.id ?? "s01-intro"}.mp4`), "-frames:v", "1", "-vf", "scale=1280:720", "-q:v", "3", join(paths.landingDir, "agrorende-demo-pt-BR.jpg")]);
  const size = statSync(mp4).size / (1024 * 1024);
  console.log(`  ${mp4} ${clock.toFixed(1)}s ${size.toFixed(1)} MB`);
  if (size > 12) throw new Error(`The highlights cut is ${size.toFixed(1)} MB, above the 12 MB budget.`);
  if (!existsSync(paths.finalVtt)) copyFileSync(join(paths.landingDir, "agrorende-demo-pt-BR.vtt"), paths.finalVtt);
}
