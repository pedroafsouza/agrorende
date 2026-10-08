import { daysAgo, deleteInChunks, type Doc, type JobContext, type JobHandler } from "./index.js";

/**
 * `diagnostics.prune` (T05.12, ARCHITECTURE §10 and §21.2), daily at 03:25: deletes
 * `device_diagnostics` older than the 30-day support retention window and trims payloads above
 * 256 KB that were accepted before the limit was enforced. Metrics are counts only; payload
 * contents never reach the logs.
 */

export const DIAGNOSTICS_RETENTION_DAYS = 30;
export const DIAGNOSTIC_PAYLOAD_MAX_BYTES = 256 * 1024;
/** Log lines kept when an oversized payload is trimmed (the client sends at most 500). */
export const TRIMMED_LOG_LINES = 100;

const LOG_FIELDS = ["logLines", "logs", "log"] as const;

function payloadBytes(payload: unknown): number {
  return Buffer.byteLength(JSON.stringify(payload ?? null), "utf8");
}

/** Keeps the newest log lines that fit; drops everything else when the payload is not log shaped. */
export function trimDiagnosticPayload(payload: unknown, maxBytes = DIAGNOSTIC_PAYLOAD_MAX_BYTES): Doc {
  const originalBytes = payloadBytes(payload);
  if (payload !== null && typeof payload === "object" && !Array.isArray(payload)) {
    const trimmed: Doc = { ...(payload as Doc), truncated: true, originalBytes };
    for (const field of LOG_FIELDS) {
      const lines = trimmed[field];
      if (Array.isArray(lines)) {
        trimmed[field] = lines.slice(-TRIMMED_LOG_LINES);
      }
    }
    if (payloadBytes(trimmed) <= maxBytes) {
      return trimmed;
    }
    const summary: Doc = { truncated: true, originalBytes };
    for (const field of ["appVersion", "platform", "osVersion", "runtimeVersion", "sync"]) {
      if (field in trimmed && payloadBytes(trimmed[field]) <= 16 * 1024) {
        summary[field] = trimmed[field];
      }
    }
    return summary;
  }
  return { truncated: true, originalBytes };
}

export async function trimOversizedDiagnostics(ctx: JobContext): Promise<number> {
  const diagnostics = ctx.platform.collection("device_diagnostics");
  const oversized = await diagnostics
    .aggregate([
      { $match: { "payload.truncated": { $ne: true } } },
      { $project: { _id: 1, bytes: { $bsonSize: "$$ROOT" } } },
      { $match: { bytes: { $gt: DIAGNOSTIC_PAYLOAD_MAX_BYTES } } },
      { $limit: 500 },
    ])
    .toArray();
  let trimmed = 0;
  for (const { _id } of oversized) {
    const row = await diagnostics.findOne({ _id }, { projection: { payload: 1 } });
    if (row === null) {
      continue;
    }
    const result = await diagnostics.updateOne({ _id, "payload.truncated": { $ne: true } }, { $set: { payload: trimDiagnosticPayload(row.payload) } });
    trimmed += result.modifiedCount;
  }
  return trimmed;
}

export const handler: JobHandler = async (ctx) => {
  const deleted = await deleteInChunks(ctx.platform.collection("device_diagnostics"), { createdAt: { $lt: daysAgo(ctx.now, DIAGNOSTICS_RETENTION_DAYS) } });
  const trimmed = await trimOversizedDiagnostics(ctx);
  ctx.logger.info("diagnostics.prune", { deleted, trimmed });
  return { deleted, trimmed };
};
