// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { intlErrors, renderWithProviders } from "@/features/ops/testing";

import { MediaGallery, mediaReadUrl } from "./MediaGallery";

const PHOTO = { id: "0b9a2f3e-6a51-4f6e-8d0c-2f6f5f2c9a11", kind: "PHOTO" as const, status: "UPLOADED" as const, caption: "Pneu" };

const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 200 })));

beforeEach(() => {
  intlErrors.length = 0;
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("mediaReadUrl", () => {
  it("asks the authorizing read route, never the token-only blob route", () => {
    expect(mediaReadUrl(PHOTO.id, "thumb")).toBe(`/api/v1/media/${PHOTO.id}/url?variant=thumb&fallback=original`);
    expect(mediaReadUrl(PHOTO.id, "original")).toBe(`/api/v1/media/${PHOTO.id}/url?variant=original`);
    expect(mediaReadUrl(PHOTO.id, "thumb", 2)).toContain("&r=2");
    expect(mediaReadUrl(PHOTO.id, "thumb")).not.toContain("/blob");
  });
});

describe("MediaGallery", () => {
  it("renders the thumbnail through the signed read URL with the original as fallback", () => {
    renderWithProviders(<MediaGallery items={[PHOTO]} />);
    const image = screen.getByTestId("media-image");
    expect(image.getAttribute("src")).toBe(mediaReadUrl(PHOTO.id, "thumb"));
    expect(intlErrors).toEqual([]);
  });

  it("refreshes the session and retries once on its own before showing anything", async () => {
    renderWithProviders(<MediaGallery items={[PHOTO]} />);
    fireEvent.error(screen.getByTestId("media-image"));
    await waitFor(() => expect(screen.getByTestId("media-image").getAttribute("src")).toContain("&r=1"));
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/auth/refresh", expect.objectContaining({ method: "POST" }));
    expect(screen.queryByTestId("media-image-failed")).toBeNull();
  });

  it("shows the recovery tile instead of a broken image, and Try again loads it again", async () => {
    renderWithProviders(<MediaGallery items={[PHOTO]} />, { locale: "pt-BR" });
    fireEvent.error(screen.getByTestId("media-image"));
    await waitFor(() => expect(screen.getByTestId("media-image").getAttribute("src")).toContain("&r=1"));
    fireEvent.error(screen.getByTestId("media-image"));

    const tile = await screen.findByTestId("media-image-failed");
    expect(tile.getAttribute("role")).toBe("alert");
    expect(tile.textContent).toContain("Não foi possível mostrar a foto");
    expect(screen.queryByTestId("media-image")).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    });
    await waitFor(() => expect(screen.getByTestId("media-image").getAttribute("src")).toContain("&r=2"));
    expect(screen.queryByTestId("media-image-failed")).toBeNull();
    expect(intlErrors).toEqual([]);
  });

  it("keeps the waiting tile for uploads that have not finished", () => {
    renderWithProviders(<MediaGallery items={[{ ...PHOTO, status: "PENDING" }]} />);
    expect(screen.queryByTestId("media-image")).toBeNull();
    expect(screen.getByText("Uploading…")).toBeTruthy();
  });

  it("opens the original in the viewer", () => {
    HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    });
    HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
      this.removeAttribute("open");
    });
    renderWithProviders(<MediaGallery items={[PHOTO]} />);
    fireEvent.click(screen.getByRole("button", { name: "Pneu" }));
    const sources = screen.getAllByTestId("media-image").map((image) => image.getAttribute("src"));
    expect(sources).toContain(mediaReadUrl(PHOTO.id, "original"));
  });
});
