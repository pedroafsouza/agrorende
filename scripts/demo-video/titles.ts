/*
 * Title cards: a branded HTML page with the logo, a heading and one of the product's Lottie
 * animations, recorded as video for exactly as long as the narration of the scene.
 */
import { readFileSync, renameSync } from "node:fs";
import { join } from "node:path";

import { brand, paths } from "./config.ts";
import { launch, writeJson } from "./lib/browser.ts";
import { allScenes } from "./script.pt-BR.ts";
import type { SceneAudio } from "./tts.ts";

const SIZE = { width: 1920, height: 1080 } as const;

function escapeHtml(text: string): string {
  return text.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;");
}

function cardHtml(heading: string, sub: string, eyebrow: string, lottie: string | undefined): string {
  const logo = readFileSync(paths.logoSvg, "utf8");
  const player = readFileSync(paths.lottiePlayer, "utf8");
  const animation = lottie === undefined ? "null" : readFileSync(join(paths.lottieDir, `${lottie}.json`), "utf8");
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; margin: 0; }
    html, body { width: ${SIZE.width}px; height: ${SIZE.height}px; overflow: hidden; }
    body { font-family: Inter, "SF Pro Display", -apple-system, "Helvetica Neue", Arial, sans-serif; color: ${brand.graphite900};
      background: radial-gradient(1200px 700px at 78% 55%, ${brand.mata50} 0%, #FFFFFF 70%); }
    .bar { position: absolute; left: 0; right: 0; bottom: 0; height: 14px; background: linear-gradient(90deg, ${brand.mata600} 0 70%, ${brand.terra600} 70% 100%); }
    .wrap { position: absolute; inset: 0; display: grid; grid-template-columns: 1fr 640px; align-items: center; padding: 0 140px; gap: 80px; }
    .logo svg { height: 64px; width: auto; }
    .eyebrow { margin-top: 72px; font-size: 30px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: ${brand.terra600}; }
    h1 { margin-top: 18px; font-size: 92px; line-height: 1.04; font-weight: 800; letter-spacing: -.02em; }
    p { margin-top: 28px; font-size: 38px; line-height: 1.35; color: ${brand.graphite700}; max-width: 900px; }
    #anim { width: 640px; height: 640px; }
    .in { opacity: 0; transform: translateY(24px); animation: in .7s cubic-bezier(.2,.8,.2,1) forwards; }
    .d1 { animation-delay: .15s } .d2 { animation-delay: .3s } .d3 { animation-delay: .45s }
    @keyframes in { to { opacity: 1; transform: none; } }
  </style></head><body>
    <div class="wrap">
      <div>
        <div class="logo in">${logo}</div>
        <div class="eyebrow in d1">${escapeHtml(eyebrow)}</div>
        <h1 class="in d2">${escapeHtml(heading)}</h1>
        ${sub === "" ? "" : `<p class="in d3">${escapeHtml(sub)}</p>`}
      </div>
      <div id="anim" class="in d2"></div>
    </div>
    <div class="bar"></div>
    <script>${player}</script>
    <script>
      const data = ${animation};
      window.__ready = new Promise((resolve) => {
        if (data === null) { resolve(); return; }
        const anim = lottie.loadAnimation({ container: document.getElementById('anim'), renderer: 'svg', loop: true, autoplay: false, animationData: data });
        anim.addEventListener('DOMLoaded', () => resolve());
        window.__play = () => anim.play();
      });
    </script>
  </body></html>`;
}

export async function recordTitles(): Promise<void> {
  const audio = JSON.parse(readFileSync(join(paths.tts, "durations.json"), "utf8")) as SceneAudio[];
  const durations = new Map(audio.map((a) => [a.id, a.duration]));
  const browser = await launch();
  const marks: Record<string, number> = {};
  try {
    for (const scene of allScenes()) {
      const v = scene.visual;
      if (v.kind !== "title") continue;
      const context = await browser.newContext({ viewport: SIZE, recordVideo: { dir: paths.raw, size: SIZE } });
      const page = await context.newPage();
      const t0 = Date.now();
      await page.setContent(cardHtml(v.heading, v.sub ?? "", v.eyebrow ?? "", v.lottie), { waitUntil: "load" });
      await page.evaluate(async () => {
        const w = window as unknown as { __ready: Promise<void>; __play?: () => void };
        await w.__ready;
        w.__play?.();
        document.querySelectorAll(".in").forEach((el) => {
          const node = el as HTMLElement;
          node.style.animation = "none";
          void node.offsetWidth;
          node.style.animation = "";
        });
      });
      marks[scene.id] = (Date.now() - t0) / 1000;
      await page.waitForTimeout(((durations.get(scene.id) ?? 5) + 0.6) * 1000);
      const video = page.video();
      await context.close();
      if (video !== null) renameSync(await video.path(), join(paths.raw, `title-${scene.id}.webm`));
      console.log(`  title ${scene.id}`);
    }
  } finally {
    await browser.close();
  }
  writeJson(join(paths.raw, "title-marks.json"), marks);
}
