// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ContactActions, type ContactLabels, HANDOFF_TIMEOUT_MS } from "./ContactActions";

const labels: ContactLabels = {
  whatsapp: "WhatsApp",
  email: "E-mail",
  phoneLabel: "Phone",
  emailLabel: "Address",
  subjectLabel: "Subject",
  messageLabel: "Message",
  copy: "Copy",
  copied: "Copied",
  copyFailed: "Select and copy",
  close: "Close",
  openAgain: "Try again",
  privacyNote: "Nothing is sent",
  whatsappTitle: "WhatsApp did not open",
  whatsappBody: "Copy the number",
  emailTitle: "E-mail did not open",
  emailBody: "Copy the address",
};

function renderActions() {
  return render(
    <ContactActions
      labels={labels}
      whatsappHref="https://wa.me/5511999999999?text=Oi"
      mailtoHref="mailto:contato@agrorende.com.br?subject=Oi"
      phone="+55 11 99999-9999"
      email="contato@agrorende.com.br"
      subject="Oi"
      message="Quero saber mais"
    />,
  );
}

const fetchSpy = vi.fn();
const beaconSpy = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", fetchSpy);
  Object.defineProperty(navigator, "sendBeacon", { value: beaconSpy, configurable: true });
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  expect(fetchSpy).not.toHaveBeenCalled();
  expect(beaconSpy).not.toHaveBeenCalled();
  expect(localStorage.length).toBe(0);
  expect(sessionStorage.length).toBe(0);
  expect(document.cookie).toBe("");
});

describe("ContactActions", () => {
  it("renders plain links that work without JavaScript", () => {
    renderActions();
    const whatsapp = screen.getByRole("link", { name: "WhatsApp" });
    expect(whatsapp.getAttribute("href")).toBe("https://wa.me/5511999999999?text=Oi");
    expect(whatsapp.getAttribute("rel")).toBe("noopener noreferrer");
    expect(screen.getByRole("link", { name: "E-mail" }).getAttribute("href")).toMatch(/^mailto:/u);
  });

  it("shows the WhatsApp panel at once when the popup is blocked (EC-SITE-03)", () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    const { container } = renderActions();
    fireEvent.click(screen.getByRole("link", { name: "WhatsApp" }));
    const panel = container.querySelector('[data-fallback="whatsapp"]');
    expect(panel).not.toBeNull();
    expect(screen.getByDisplayValue("+55 11 99999-9999")).toBeTruthy();
    expect(screen.getByDisplayValue("contato@agrorende.com.br")).toBeTruthy();
    expect(document.activeElement?.textContent).toBe("WhatsApp did not open");
  });

  it("shows the WhatsApp panel when the new tab opens but the page never loses focus", () => {
    vi.spyOn(window, "open").mockReturnValue({ opener: window } as unknown as Window);
    const { container } = renderActions();
    fireEvent.click(screen.getByRole("link", { name: "WhatsApp" }));
    expect(container.querySelector("[data-fallback]")).toBeNull();
    act(() => {
      vi.advanceTimersByTime(HANDOFF_TIMEOUT_MS + 10);
    });
    expect(container.querySelector('[data-fallback="whatsapp"]')).not.toBeNull();
  });

  it("does not show a panel when the browser hands off", () => {
    vi.spyOn(window, "open").mockReturnValue({ opener: window } as unknown as Window);
    const { container } = renderActions();
    fireEvent.click(screen.getByRole("link", { name: "WhatsApp" }));
    act(() => {
      window.dispatchEvent(new Event("blur"));
      vi.advanceTimersByTime(HANDOFF_TIMEOUT_MS + 10);
    });
    expect(container.querySelector("[data-fallback]")).toBeNull();
  });

  it("shows the e-mail panel when no mail client takes the mailto link (EC-SITE-04)", () => {
    const { container } = renderActions();
    const link = screen.getByRole("link", { name: "E-mail" });
    link.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(link);
    act(() => {
      vi.advanceTimersByTime(HANDOFF_TIMEOUT_MS + 10);
    });
    expect(container.querySelector('[data-fallback="email"]')).not.toBeNull();
    expect(screen.getByDisplayValue("Oi")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(container.querySelector("[data-fallback]")).toBeNull();
  });

  it("copies with the clipboard and falls back to selecting the text", async () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    renderActions();
    fireEvent.click(screen.getByRole("link", { name: "WhatsApp" }));
    const [firstCopy] = screen.getAllByRole("button", { name: "Copy" });
    await act(async () => {
      fireEvent.click(firstCopy as HTMLElement);
      await Promise.resolve();
    });
    expect(writeText).toHaveBeenCalledWith("+55 11 99999-9999");
    expect(screen.getByRole("status").textContent).toBe("Select and copy");

    writeText.mockResolvedValue(undefined);
    const [, secondCopy] = screen.getAllByRole("button", { name: "Copy" });
    await act(async () => {
      fireEvent.click(secondCopy as HTMLElement);
      await Promise.resolve();
    });
    expect(screen.getByRole("button", { name: "Copied" })).toBeTruthy();
  });
});
