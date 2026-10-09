import type { MediaMeta } from "@agrorende/contracts/sync";

import type { MediaDraft } from "../../components/MediaCapture";
import type { MirrorRow } from "../../db/mirror";
import type { SqlDb } from "../../db/sql";
import { useLocalQuery } from "../../lib/useLocalQuery";
import { localMediaUri } from "../../media/capture";
import { getJobDetail, type JobDetail } from "./logic";
import { findMeterJumpConflict, type MeterJumpConflict } from "./meterJump";

export type JobView = JobDetail & {
  readonly localMedia: readonly MediaDraft[];
  /** A completion the server rejected with `METER_READING_JUMP`, waiting for the technician (EC-WO-14). */
  readonly meterJump?: MeterJumpConflict;
};

/** Mirror row → `MediaMeta` for `media.register` and the thumbnail strip. */
export function mediaMetaOf(row: MirrorRow, workOrderId: string): MediaMeta {
  return {
    id: String(row.id),
    kind: String(row.kind ?? "PHOTO") as MediaMeta["kind"],
    tag: String(row.tag ?? "GENERAL"),
    mimeType: String(row.mimeType ?? "image/jpeg"),
    capturedAt: String(row.capturedAt ?? row.createdAt ?? ""),
    parent: { type: "WORK_ORDER", id: workOrderId },
  };
}

export async function loadJobView(db: SqlDb, id: string): Promise<JobView | undefined> {
  const detail = await getJobDetail(db, id);
  if (detail === undefined) return undefined;
  const localMedia: MediaDraft[] = [];
  for (const row of detail.media) {
    const uri = await localMediaUri(db, String(row.id), "thumb");
    if (uri !== undefined) localMedia.push({ ...mediaMetaOf(row, id), localUri: uri });
  }
  const lastReading = typeof detail.asset?.hourMeter === "number" ? detail.asset.hourMeter : null;
  const meterJump = await findMeterJumpConflict(db, "WORK_ORDER", id, lastReading);
  return { ...detail, localMedia, ...(meterJump === undefined ? {} : { meterJump }) };
}

export function useJob(id: string) {
  return useLocalQuery((db) => loadJobView(db, id), [id]);
}
