// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { bodyScript, headScript, recoveryScript, SLOW_LOAD_MS, THEME_KEY } from "./inlineScripts";

const replace = vi.fn();

function run(script: string): void {
  new Function(script)();
}

function at(url: string, languages: readonly string[] = ["pt-BR"]): void {
  window.history.replaceState(null, "", url);
  Object.defineProperty(navigator, "languages", { value: languages, configurable: true });
}

beforeEach(() => {
  vi.useFakeTimers();
  replace.mockReset();
  vi.spyOn(window, "location", "get").mockReturnValue({
    ...window.location,
    get pathname() {
      return new URL(document.URL).pathname;
    },
    get search() {
      return new URL(document.URL).search;
    },
    get hash() {
      return new URL(document.URL).hash;
    },
    replace,
  } as Location);
  document.documentElement.removeAttribute("data-lite");
  document.documentElement.removeAttribute("data-js");
  document.documentElement.removeAttribute("data-theme");
  window.localStorage.clear();
  document.body.innerHTML = "";
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("headScript (EC-SITE-05, EC-SITE-06)", () => {
  it("marks the document as scripted and enters lite mode on ?lite=1", () => {
    at("/pt-br/?lite=1");
    run(headScript());
    expect(document.documentElement.dataset.js).toBe("on");
    expect(document.documentElement.dataset.lite).toBe("on");
  });

  it("enters lite mode when the page has not loaded after the timeout", () => {
    at("/pt-br/");
    run(headScript());
    expect(document.documentElement.dataset.lite).toBeUndefined();
    vi.advanceTimersByTime(SLOW_LOAD_MS + 1);
    expect(document.documentElement.dataset.lite).toBe("on");
  });

  it("respects ?lite=0", () => {
    at("/pt-br/?lite=0");
    run(headScript());
    vi.advanceTimersByTime(SLOW_LOAD_MS + 1);
    expect(document.documentElement.dataset.lite).toBe("off");
  });
});

describe("bodyScript", () => {
  it("reveals the unsupported-locale banner (EC-SITE-01) and lets the visitor dismiss it", () => {
    document.body.innerHTML = '<div id="locale-banner" hidden><button data-dismiss="locale-banner">x</button></div>';
    at("/pt-br/?unsupported=es");
    run(bodyScript());
    const banner = document.getElementById("locale-banner");
    expect(banner?.hidden).toBe(false);
    banner?.querySelector("button")?.click();
    expect(banner?.hidden).toBe(true);
  });

  it("leaves lite mode on retry", () => {
    document.body.innerHTML = '<button data-lite-retry>retry</button>';
    document.documentElement.setAttribute("data-lite", "on");
    at("/pt-br/");
    run(bodyScript());
    document.querySelector("button")?.click();
    expect(document.documentElement.dataset.lite).toBe("off");
  });
});

describe("recoveryScript", () => {
  it("lower-cases a wrong-case locale prefix", () => {
    at("/PT-BR/planos/");
    run(recoveryScript());
    expect(replace).toHaveBeenCalledWith("/pt-br/planos/");
  });

  it("sends an unsupported locale to the best supported one, keeping the page (EC-SITE-01)", () => {
    at("/es/pricing/", ["es-AR", "en-US"]);
    run(recoveryScript());
    expect(replace).toHaveBeenCalledWith("/en/pricing/?unsupported=es");
  });

  it("translates the page when the target locale differs", () => {
    at("/fr/planos/", ["fr-FR"]);
    run(recoveryScript());
    expect(replace).toHaveBeenCalledWith("/pt-br/planos/?unsupported=fr");
  });

  it("canonicalises upper-case help codes", () => {
    at("/en/help/errors/FIRST_SYNC_LARGE/");
    run(recoveryScript());
    expect(replace).toHaveBeenCalledWith("/en/help/errors/first-sync-large/");
  });

  it("sends unknown help codes to the unknown-code page (EC-SITE-07)", () => {
    at("/pt-br/ajuda/erros/NAO_EXISTE/");
    run(recoveryScript());
    expect(replace).toHaveBeenCalledWith("/pt-br/ajuda/erros/codigo-desconhecido/?code=NAO_EXISTE");
  });

  it("leaves the unknown-code page alone", () => {
    at("/pt-br/ajuda/erros/codigo-desconhecido/?code=NAO_EXISTE");
    run(recoveryScript());
    expect(replace).not.toHaveBeenCalled();
  });
});

describe("theme", () => {
  it("is light by default, even when the system prefers dark", () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true } as MediaQueryList);
    run(headScript());
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });

  it("restores a remembered dark choice before first paint", () => {
    window.localStorage.setItem(THEME_KEY, "dark");
    run(headScript());
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("toggles dark mode, updates every toggle and remembers the choice", () => {
    document.head.innerHTML = '<meta name="theme-color" content="#ffffff">';
    document.body.innerHTML = '<button data-theme-toggle aria-pressed="false">a</button><button data-theme-toggle aria-pressed="false">b</button>';
    run(bodyScript());
    const [first, second] = Array.from(document.querySelectorAll("button"));
    first?.click();
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(second?.getAttribute("aria-pressed")).toBe("true");
    expect(window.localStorage.getItem(THEME_KEY)).toBe("dark");
    expect(document.querySelector("meta")?.getAttribute("content")).toBe("#111315");
    second?.click();
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    expect(first?.getAttribute("aria-pressed")).toBe("false");
    expect(window.localStorage.getItem(THEME_KEY)).toBe("light");
  });
});
