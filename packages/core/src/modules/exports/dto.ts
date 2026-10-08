import { z } from "zod";
import type { ExportJobStatus } from "@agrorende/contracts/enums";

export const EXPORT_ENTITIES = ["field-reports", "work-orders", "rentals", "assets", "costs", "location-pings"] as const;
export type ExportEntity = (typeof EXPORT_ENTITIES)[number];
export const ExportEntityEnum = z.enum(EXPORT_ENTITIES);

export const EXPORT_LOCALES = ["pt-BR", "en"] as const;
export type ExportLocale = (typeof EXPORT_LOCALES)[number];

/** Exports above this many rows are built by the worker instead of streamed. */
export const STREAM_ROW_LIMIT = 50_000;
export const DOWNLOAD_TTL_DAYS = 7;
/** A RUNNING job older than this is considered abandoned and may be claimed again. */
export const STALE_RUNNING_MS = 15 * 60_000;

const IsoDate = z.string().datetime({ offset: true });
const Uuid = z.string().uuid();

export const ExportFiltersSchema = z
  .object({
    from: IsoDate.optional(),
    to: IsoDate.optional(),
    status: z.string().min(1).max(40).optional(),
    assetId: Uuid.optional(),
    customerId: Uuid.optional(),
    userId: Uuid.optional(),
    category: z.string().min(1).max(40).optional(),
  })
  .strict();
export type ExportFilters = z.infer<typeof ExportFiltersSchema>;

export const CreateExportInputSchema = z.object({ entity: ExportEntityEnum, filters: ExportFiltersSchema.default({}) });
export type CreateExportInput = z.infer<typeof CreateExportInputSchema>;

export interface ExportJobDTO {
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

export interface ExportJobDoc {
  readonly _id: string;
  readonly organizationId: string;
  readonly requestedById: string;
  readonly entity: string;
  readonly filters: unknown;
  readonly status: ExportJobStatus;
  readonly rowCount?: number | null;
  readonly mediaId?: string | null;
  readonly errorCode?: string | null;
  readonly createdAt: Date;
  readonly startedAt?: Date | null;
  readonly finishedAt?: Date | null;
  readonly expiresAt?: Date | null;
}

export function toExportJobDTO(doc: ExportJobDoc, now: Date = new Date()): ExportJobDTO {
  const expired = doc.status === "READY" && doc.expiresAt != null && doc.expiresAt.getTime() <= now.getTime();
  const status: ExportJobStatus = expired ? "EXPIRED" : doc.status;
  return {
    id: doc._id,
    entity: doc.entity as ExportEntity,
    status,
    rowCount: doc.rowCount ?? null,
    errorCode: doc.errorCode ?? null,
    createdAt: doc.createdAt.toISOString(),
    finishedAt: doc.finishedAt?.toISOString() ?? null,
    expiresAt: doc.expiresAt?.toISOString() ?? null,
    downloadUrl: status === "READY" ? `/api/v1/exports/${doc._id}?download=1` : null,
  };
}

export function exportStorageKey(orgId: string, jobId: string): string {
  return `exports/${orgId}/${jobId}.csv`;
}

export function exportFileName(entity: ExportEntity, now: Date): string {
  return `agrorende-${entity}-${now.toISOString().slice(0, 10)}.csv`;
}
