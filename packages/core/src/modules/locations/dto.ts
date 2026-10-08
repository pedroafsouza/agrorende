import { z } from "zod";

import { LocationFixSchema, OperatorStateEnum } from "@agrorende/contracts/realtime";

/** Fixes accepted per request: 50 over the socket, 500 over the REST fallback (ARCHITECTURE §7.8). */
export const SOCKET_BATCH_MAX = 50;
export const REST_BATCH_MAX = 500;

/** Sanity limits applied before a fix is stored. */
export const MAX_ACCURACY_M = 500;
export const MAX_SPEED_MPS = 70;
export const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;
export const RETENTION_DAYS = 30;

export function locationBatchSchema(max: number) {
  return z.object({ fixes: z.array(LocationFixSchema).max(max) });
}

export const LocationBatchRequestSchema = locationBatchSchema(REST_BATCH_MAX);
export type LocationBatchRequest = z.infer<typeof LocationBatchRequestSchema>;

export interface IngestResult {
  readonly accepted: number;
  readonly dropped: number;
}

/** JSON stored per user in the `live:<orgId>` Redis hash. */
export const LiveRecordSchema = z.object({
  userId: z.string(),
  lat: z.number(),
  lng: z.number(),
  accuracyM: z.number().optional(),
  heading: z.number().optional(),
  speedMps: z.number().optional(),
  recordedAt: z.string(),
  recordedAtMs: z.number(),
  state: OperatorStateEnum,
  workOrderId: z.string().optional(),
});
export type LiveRecord = z.infer<typeof LiveRecordSchema>;

export interface LocationsDTO {
  readonly id: string;
  readonly organizationId: string;
  readonly userId: string;
  readonly recordedAt: string;
  readonly lat: number;
  readonly lng: number;
  readonly accuracyM: number | null;
  readonly speedMps: number | null;
  readonly heading: number | null;
  readonly workOrderId: string | null;
}
