import "server-only";

import type { Role } from "@agrorende/contracts/enums";
import { resolveLocale } from "@agrorende/i18n/locales";
import { NextResponse, type NextRequest } from "next/server";

import { OFFICE, readJson, route, type AuthedCtx } from "@/lib/core.server";

import * as exportsCore from "../../../../../packages/core/src/modules/exports/service";
import { REST_BATCH_MAX } from "../../../../../packages/core/src/modules/locations/dto";
import * as locationsCore from "../../../../../packages/core/src/modules/locations/service";

/*
 * Route handlers for the T05 endpoints (`/locations/batch` and `/exports/**`). `@agrorende/core`
 * does not export `modules/**` yet (change request T05-001), so the services are reached through
 * a relative path in this one file; the route files stay one-line re-exports.
 */

const FIELD_ROLES: readonly Role[] = ["ADMIN", "MANAGER", "FIELD"];

function exportCtx(request: NextRequest, ctx: AuthedCtx) {
  const candidates = [request.nextUrl.searchParams.get("locale") ?? "", ...(request.headers.get("accept-language") ?? "").split(",")];
  return { orgId: ctx.orgId, userId: ctx.userId, role: ctx.role, locale: resolveLocale(candidates.filter((value) => value.trim() !== "")) };
}

function filtersFrom(request: NextRequest): Record<string, string> {
  const filters = Object.fromEntries(request.nextUrl.searchParams.entries());
  delete filters.locale;
  return filters;
}

function attachment(fileName: string): string {
  return `attachment; filename="${fileName.replace(/["\\\r\n]/gu, "_")}"`;
}

function streamOf(chunks: AsyncIterable<string>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const iterator = chunks[Symbol.asyncIterator]();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const next = await iterator.next();
      if (next.done === true) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(next.value));
    },
    async cancel() {
      await iterator.return?.();
    },
  });
}

/** EC-OPS-11: above 50 000 rows the export runs in the worker and the client polls the job. */
function jobStarted(job: exportsCore.ExportRequestResult & { kind: "job" }, requestId: string): NextResponse {
  // `EXPORT_JOB_STARTED` is a client-kind code outside `ErrorCode`, so the §8 envelope is built here.
  const envelope = {
    error: { code: "EXPORT_JOB_STARTED", message: "EXPORT_JOB_STARTED", retryable: true, details: { jobId: job.job.id, status: job.job.status }, ref: requestId },
  };
  return NextResponse.json({ ...envelope, job: job.job }, { status: 202, headers: { location: `/api/v1/exports/${job.job.id}` } });
}

export async function exportCsv(request: NextRequest, ctx: AuthedCtx, entity: string): Promise<NextResponse> {
  const result = await exportsCore.requestExport(exportCtx(request, ctx), entity, filtersFrom(request), await exportsCore.resolveExportDeps());
  if (result.kind === "job") return jobStarted(result, ctx.requestId);
  return new NextResponse(streamOf(result.chunks), {
    status: 200,
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": attachment(result.fileName), "cache-control": "no-store" },
  });
}

/** `/exports/:entity.csv`, matched from the pathname so it works whatever segment captured it. */
export function csvEntity(pathname: string): string | null {
  const match = /\/exports\/([a-z-]+)\.csv$/u.exec(pathname);
  return match?.[1] ?? null;
}

export const getExportCsv = route(OFFICE, async (request, ctx, params) => {
  const entity = csvEntity(request.nextUrl.pathname) ?? (params.entity ?? "").replace(/\.csv$/u, "");
  return exportCsv(request, ctx, entity);
});

export const postExport = route(OFFICE, async (request, ctx) => {
  const { job, created } = await exportsCore.createExportJob(exportCtx(request, ctx), await readJson(request), await exportsCore.resolveExportDeps());
  return NextResponse.json({ job, created }, { status: created ? 202 : 200, headers: { location: `/api/v1/exports/${job.id}` } });
});

export const getExport = route(OFFICE, async (request, ctx, params) => {
  const entity = csvEntity(request.nextUrl.pathname);
  if (entity !== null) return exportCsv(request, ctx, entity);
  const id = params.id ?? "";
  const deps = await exportsCore.resolveExportDeps();
  if (request.nextUrl.searchParams.get("download") === "1") {
    const file = await exportsCore.downloadExportJob(exportCtx(request, ctx), id, deps);
    return new NextResponse(file.body as unknown as BodyInit, {
      status: 200,
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": attachment(file.fileName), "cache-control": "private, no-store" },
    });
  }
  return exportsCore.getExportJob(exportCtx(request, ctx), id, deps);
});

/** REST fallback for location batches (ARCHITECTURE §7.8): up to 500 fixes, duplicates ignored. */
export const postLocationBatch = route(FIELD_ROLES, async (request, ctx) => {
  return locationsCore.ingest({ orgId: ctx.orgId, userId: ctx.userId, deviceId: ctx.deviceId }, await readJson(request), { maxFixes: REST_BATCH_MAX });
});
