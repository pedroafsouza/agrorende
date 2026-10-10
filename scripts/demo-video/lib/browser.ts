/*
 * Playwright helpers shared by the recorders: a visible cursor with click ripples, smooth pointer moves,
 * human-paced typing, scene marks on a shared clock, and HTML-to-PNG rendering for title cards.
 */
import { writeFileSync } from "node:fs";

import { chromium, type Browser, type BrowserContext, type Locator, type Page } from "playwright";

/** Injected into every recorded page: draws a cursor that follows the mouse and a ripple on each click. */
export const CURSOR_SCRIPT = `
(() => {
  if (window.__demoCursor) return;
  window.__demoCursor = true;
  const install = () => {
    if (!document.body) { requestAnimationFrame(install); return; }
    const style = document.createElement('style');
    style.textContent = \`
      nextjs-portal { display: none !important; }
      #demo-cursor { position: fixed; z-index: 2147483647; left: 0; top: 0; width: 28px; height: 28px; pointer-events: none;
        transform: translate(-200px, -200px); transition: transform 40ms linear; }
      #demo-cursor svg { filter: drop-shadow(0 2px 3px rgba(0,0,0,.35)); }
      .demo-ripple { position: fixed; z-index: 2147483646; width: 44px; height: 44px; margin: -22px 0 0 -22px; border-radius: 50%;
        border: 4px solid rgba(232,89,12,.9); background: rgba(232,89,12,.18); pointer-events: none; animation: demo-ripple .6s ease-out forwards; }
      .demo-touch { position: fixed; z-index: 2147483646; width: 46px; height: 46px; margin: -23px 0 0 -23px; border-radius: 50%;
        background: rgba(28,31,35,.28); border: 3px solid rgba(255,255,255,.85); pointer-events: none; animation: demo-touch .55s ease-out forwards; }
      @keyframes demo-ripple { from { transform: scale(.4); opacity: 1 } to { transform: scale(1.6); opacity: 0 } }
      @keyframes demo-touch { from { transform: scale(.7); opacity: 1 } to { transform: scale(1.25); opacity: 0 } }
      html { scroll-behavior: smooth; }
    \`;
    document.head.appendChild(style);
    const touch = matchMedia('(pointer: coarse)').matches;
    let cursor = null;
    if (!touch) {
      cursor = document.createElement('div');
      cursor.id = 'demo-cursor';
      cursor.innerHTML = '<svg width="28" height="28" viewBox="0 0 28 28"><path d="M4 2 L4 23 L9.5 18 L13 26 L17 24.5 L13.5 16.5 L21 16.5 Z" fill="#1C1F23" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg>';
      document.body.appendChild(cursor);
    }
    const move = (x, y) => { if (cursor) cursor.style.transform = 'translate(' + (x - 4) + 'px,' + (y - 2) + 'px)'; };
    window.addEventListener('mousemove', (e) => move(e.clientX, e.clientY), true);
    const ripple = (x, y) => {
      const r = document.createElement('div');
      r.className = touch ? 'demo-touch' : 'demo-ripple';
      r.style.left = x + 'px'; r.style.top = y + 'px';
      document.body.appendChild(r);
      setTimeout(() => r.remove(), 700);
    };
    window.addEventListener('pointerdown', (e) => ripple(e.clientX, e.clientY), true);
  };
  install();
})();
`;

export interface Clock {
  readonly t0: number;
  readonly marks: Record<string, number>;
  mark(name: string): void;
}

/** Scene marks are seconds since the context (and therefore its video) was created. */
export function createClock(): Clock {
  const t0 = Date.now();
  const marks: Record<string, number> = {};
  return {
    t0,
    marks,
    mark(name) {
      marks[name] = (Date.now() - t0) / 1000;
      console.log(`  mark ${name} @ ${marks[name]?.toFixed(2)}s`);
    },
  };
}

export async function launch(extraArgs: readonly string[] = []): Promise<Browser> {
  return chromium.launch({ args: ["--hide-scrollbars", "--disable-features=Translate", ...extraArgs] });
}

const pointer = new WeakMap<Page, { x: number; y: number }>();

export async function moveTo(page: Page, x: number, y: number, steps = 18): Promise<void> {
  const from = pointer.get(page) ?? { x: x - 120, y: y - 80 };
  for (let i = 1; i <= steps; i += 1) {
    const k = i / steps;
    const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
    await page.mouse.move(from.x + (x - from.x) * e, from.y + (y - from.y) * e);
    await page.waitForTimeout(16);
  }
  pointer.set(page, { x, y });
}

export async function pointAt(page: Page, target: Locator, pause = 250): Promise<{ x: number; y: number }> {
  await target.scrollIntoViewIfNeeded().catch(() => undefined);
  const box = await target.boundingBox();
  if (box === null) throw new Error(`Element not visible: ${target.toString()}`);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await moveTo(page, x, y);
  await page.waitForTimeout(pause);
  return { x, y };
}

/** Moves the visible cursor to the element, then clicks it (desktop pages). */
export async function click(page: Page, target: Locator, pause = 250): Promise<void> {
  await target.first().waitFor({ state: "visible", timeout: 30_000 });
  const { x, y } = await pointAt(page, target.first(), pause);
  await page.mouse.click(x, y);
  await page.waitForTimeout(350);
}

/** Taps the centre of an element on a touch page; the injected script draws the touch ripple. */
export async function tap(page: Page, target: Locator, pause = 350): Promise<void> {
  const el = target.first();
  await el.waitFor({ state: "visible", timeout: 30_000 });
  await el.scrollIntoViewIfNeeded().catch(() => undefined);
  await page.waitForTimeout(pause);
  const box = await el.boundingBox();
  if (box === null) throw new Error(`Element not visible: ${target.toString()}`);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.click(x, y);
  await page.waitForTimeout(450);
}

export async function typeInto(page: Page, target: Locator, text: string, delay = 55): Promise<void> {
  const el = target.first();
  await el.waitFor({ state: "visible", timeout: 30_000 });
  await el.click();
  await el.fill("");
  await page.keyboard.type(text, { delay });
  await page.waitForTimeout(250);
}

export async function smoothScroll(page: Page, deltaY: number, durationMs = 1200): Promise<void> {
  const steps = Math.max(10, Math.round(durationMs / 30));
  for (let i = 0; i < steps; i += 1) {
    await page.mouse.wheel(0, deltaY / steps);
    await page.waitForTimeout(durationMs / steps);
  }
}

export async function prepare(context: BrowserContext): Promise<void> {
  await context.addInitScript(CURSOR_SCRIPT);
}

/** Renders a standalone HTML document to a PNG with a transparent or opaque background. */
export async function renderHtml(browser: Browser, html: string, out: string, size: { width: number; height: number }, transparent = false): Promise<void> {
  const page = await browser.newPage({ viewport: size });
  await page.setContent(html, { waitUntil: "load" });
  await page.waitForTimeout(300);
  await page.screenshot({ path: out, omitBackground: transparent });
  await page.close();
}

export function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}
