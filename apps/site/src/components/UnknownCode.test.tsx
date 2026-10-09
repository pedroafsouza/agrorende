// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { HelpSearchLink, UnknownCodeNote } from "./UnknownCode";

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});

describe("UnknownCode (EC-SITE-07)", () => {
  it("renders nothing without ?code", () => {
    const { container } = render(<UnknownCodeNote label="Code" />);
    expect(container.innerHTML).toBe("");
  });

  it("shows the code as text, never as markup, and caps its length", () => {
    window.history.replaceState(null, "", `/x/?code=${encodeURIComponent(`<img src=x onerror=alert(1)>${"A".repeat(100)}`)}`);
    const { container } = render(<UnknownCodeNote label="Code" />);
    const code = container.querySelector("[data-unknown-code]");
    expect(code?.querySelector("img")).toBeNull();
    expect(code?.textContent).toHaveLength(64);
    expect(code?.textContent?.startsWith("<img src=x")).toBe(true);
  });

  it("carries the code into the help search link and keeps the hash", () => {
    window.history.replaceState(null, "", "/x/?code=NAO_EXISTE");
    render(
      <HelpSearchLink href="/pt-br/ajuda/#codigos" className="c">
        Buscar
      </HelpSearchLink>,
    );
    expect(screen.getByRole("link", { name: "Buscar" }).getAttribute("href")).toBe("/pt-br/ajuda/?q=NAO_EXISTE#codigos");
  });
});
