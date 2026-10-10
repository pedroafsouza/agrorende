import { describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api";

import { fetchQrPng, fetchQrSheet, isQrSheetTooLarge, QR_SHEET_MAX_ASSETS } from "./qrSheetApi";

function png(headers: Record<string, string> = {}): Response {
  return new Response(new Blob(["png"], { type: "image/png" }), { status: 200, headers });
}

describe("fetchQrPng", () => {
  it("asks for a PNG at the asset route and reads the file name from content-disposition", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(png({ "content-disposition": 'attachment; filename="agrorende-TR-01.png"' }));
    const file = await fetchQrPng("a1", "TR-01", fetcher);
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(url).toBe("/api/v1/assets/a1/qr.png");
    expect(init?.credentials).toBe("same-origin");
    expect(new Headers(init?.headers).get("accept")).toBe("image/png, application/json");
    expect(file.fileName).toBe("agrorende-TR-01.png");
    expect(await file.blob.text()).toBe("png");
  });

  it("falls back to the asset code as the file name", async () => {
    const file = await fetchQrPng("a1", "TR-01", vi.fn<typeof fetch>().mockResolvedValue(png()));
    expect(file.fileName).toBe("TR-01.png");
  });

  it("turns a JSON error body into an ApiError", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ error: { code: "NOT_FOUND", ref: "ref-1", retryable: false } }), { status: 404 }));
    const error = await fetchQrPng("a1", "TR-01", fetcher).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: "NOT_FOUND", status: 404, retryable: false, ref: "ref-1" });
  });

  it("treats a server error without a JSON body as a retryable INTERNAL error", async () => {
    const error = await fetchQrPng("a1", "TR-01", vi.fn<typeof fetch>().mockResolvedValue(new Response("oops", { status: 502 }))).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: "INTERNAL", status: 502, retryable: true });
  });

  it("reports a fetch that throws as BROWSER_OFFLINE", async () => {
    const error = await fetchQrPng("a1", "TR-01", vi.fn<typeof fetch>().mockRejectedValue(new TypeError("Failed to fetch"))).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: "BROWSER_OFFLINE", status: 0, retryable: true });
  });
});

describe("fetchQrSheet", () => {
  it("posts the asset ids and falls back to the default PDF name", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(new Blob(["%PDF"]), { status: 200 }));
    const file = await fetchQrSheet(["a1", "a2"], fetcher);
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(url).toBe("/api/v1/assets/qr-sheet");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ assetIds: ["a1", "a2"] });
    expect(file.fileName).toBe("agrorende-qr.pdf");
  });
});

describe("isQrSheetTooLarge", () => {
  it("allows exactly the sheet limit and rejects one more", () => {
    expect(isQrSheetTooLarge(QR_SHEET_MAX_ASSETS)).toBe(false);
    expect(isQrSheetTooLarge(QR_SHEET_MAX_ASSETS + 1)).toBe(true);
  });
});
