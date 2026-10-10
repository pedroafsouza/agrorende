import { ApiError, buildUrl } from "@/lib/api";

/** Mirrors `QR_SHEET_MAX_ASSETS` in `packages/core/src/modules/assets/qrSheet.ts`. */
export const QR_SHEET_MAX_ASSETS = 300;
/** One sheet request takes at most `QR_SHEET_MAX_ASSETS` assets; the core rejects anything larger. */
export function isQrSheetTooLarge(count: number): boolean {
  return count > QR_SHEET_MAX_ASSETS;
}

/** Mirrors `QR_LABELS_PER_PAGE`: the A4 sheet has 3 × 10 labels. */
export const QR_LABELS_PER_PAGE = 30;

/** Same payload as the PNG route and the PDF sheet (ARCHITECTURE §6, PLT-06). */
export function assetQrPayload(code: string): string {
  return `agrorende://a/${code}`;
}

export interface QrSheetFile {
  readonly blob: Blob;
  readonly fileName: string;
}

function fileNameOf(response: Response, fallback: string): string {
  const match = /filename="([^"]+)"/.exec(response.headers.get("content-disposition") ?? "");
  return match?.[1] ?? fallback;
}

async function send(request: () => Promise<Response>): Promise<Response> {
  let response: Response;
  try {
    response = await request();
  } catch {
    throw new ApiError({ code: "BROWSER_OFFLINE", status: 0, retryable: true });
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: { code?: string; ref?: string; retryable?: boolean };
    };
    throw new ApiError({
      code: (body.error?.code ?? "INTERNAL") as ApiError["code"],
      status: response.status,
      retryable: body.error?.retryable ?? response.status >= 500,
      ...(body.error?.ref === undefined ? {} : { ref: body.error.ref }),
    });
  }
  return response;
}

/** `POST /assets/qr-sheet`: the PDF comes back as a binary body, so this bypasses the JSON `api()` helper. */
export async function fetchQrSheet(
  assetIds: readonly string[],
  fetcher: typeof fetch = fetch,
): Promise<QrSheetFile> {
  const response = await send(() =>
    fetcher(buildUrl("/assets/qr-sheet"), {
      method: "POST",
      credentials: "same-origin",
      headers: { accept: "application/pdf, application/json", "content-type": "application/json" },
      body: JSON.stringify({ assetIds }),
    }),
  );
  return { blob: await response.blob(), fileName: fileNameOf(response, "agrorende-qr.pdf") };
}

/** `GET /assets/:id/qr.png`: the single 512 px label, fetched so the modal can show progress and errors. */
export async function fetchQrPng(assetId: string, code: string, fetcher: typeof fetch = fetch): Promise<QrSheetFile> {
  const response = await send(() => fetcher(buildUrl(`/assets/${assetId}/qr.png`), { credentials: "same-origin", headers: { accept: "image/png, application/json" } }));
  return { blob: await response.blob(), fileName: fileNameOf(response, `${code}.png`) };
}

export function saveFile({ blob, fileName }: QrSheetFile): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
