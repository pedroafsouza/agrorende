import type { ExportJobStatus } from "@agrorende/contracts/enums";

import { api, ApiError, buildUrl } from "@/lib/api";

/**
 * Client side of the T05 exports API. T09 builds the status and download UI on top of these
 * helpers; the server side lives in `./server.ts`.
 */

export const EXPORT_ENTITIES = ["field-reports", "work-orders", "rentals", "assets", "costs", "location-pings"] as const;
export type ExportEntity = (typeof EXPORT_ENTITIES)[number];
export type { ExportJobStatus };

export interface ExportJob {
  readonly id: string;
  readonly entity: ExportEntity;
  readonly status: ExportJobStatus;
  readonly rowCount: number | null;
  readonly errorCode: string | null;
  readonly createdAt: string;
  readonly finishedAt: string | null;
  readonly expiresAt: string | null;
  readonly downloadUrl: string | null;
}

export type ExportFilters = Readonly<Record<string, string | undefined>>;

/** Small exports come back as a file; large ones answer 202 `EXPORT_JOB_STARTED` with the job. */
export type ExportStart =
  | { readonly kind: "file"; readonly blob: Blob; readonly fileName: string }
  | { readonly kind: "job"; readonly job: ExportJob };

function fileNameOf(response: Response, fallback: string): string {
  const match = /filename="([^"]+)"/u.exec(response.headers.get("content-disposition") ?? "");
  return match?.[1] ?? fallback;
}

export function exportCsvUrl(entity: ExportEntity, filters: ExportFilters = {}, locale?: string): string {
  return buildUrl(`/exports/${entity}.csv`, { ...filters, locale });
}

/** Starts a background export (`POST /exports`); the same entity and filters reuse the running job. */
export async function createExport(entity: ExportEntity, filters: ExportFilters = {}): Promise<ExportJob> {
  const result = await api<{ job: ExportJob; created: boolean }>("/exports", { method: "POST", body: { entity, filters } });
  return result.job;
}

export function getExportJob(id: string, signal?: AbortSignal): Promise<ExportJob> {
  return api<ExportJob>(`/exports/${id}`, signal === undefined ? {} : { signal });
}

/**
 * Requests `GET /exports/:entity.csv`: up to 50 000 rows stream back as a file; above that the
 * server starts (or reuses) an `ExportJob` and answers 202 (EC-OPS-11).
 */
export async function startExport(entity: ExportEntity, filters: ExportFilters = {}, locale?: string, fetcher: typeof fetch = fetch): Promise<ExportStart> {
  let response: Response;
  try {
    response = await fetcher(exportCsvUrl(entity, filters, locale), { credentials: "same-origin" });
  } catch {
    throw new ApiError({ code: "BROWSER_OFFLINE", status: 0, retryable: true });
  }
  if (response.status === 202) {
    const body = (await response.json()) as { job: ExportJob };
    return { kind: "job", job: body.job };
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: { code?: string; ref?: string; retryable?: boolean } };
    throw new ApiError({
      code: (body.error?.code ?? "INTERNAL") as ApiError["code"],
      status: response.status,
      retryable: body.error?.retryable ?? response.status >= 500,
      ...(body.error?.ref === undefined ? {} : { ref: body.error.ref }),
    });
  }
  return { kind: "file", blob: await response.blob(), fileName: fileNameOf(response, `${entity}.csv`) };
}

export function isTerminal(status: ExportJobStatus): boolean {
  return status === "READY" || status === "FAILED" || status === "EXPIRED";
}
