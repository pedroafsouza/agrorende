"use client";

import { CheckCircle2, Download, FileSpreadsheet, Hourglass, RotateCw, XCircle } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Badge, type Tone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ErrorAlert } from "@/components/recovery/ErrorAlert";
import { startExport, type ExportEntity, type ExportFilters, type ExportJob, type ExportJobStatus, type ExportStart } from "@/features/exports/api";
import { useExportJob } from "@/features/exports/useExportJob";
import { formatDateTime } from "@/lib/format";

import { downloadBlob, parseCsvPreview, readBlobText } from "./csvPreview";

const STATUS_TONE: Readonly<Record<ExportJobStatus, Tone>> = { QUEUED: "info", RUNNING: "info", READY: "success", FAILED: "danger", EXPIRED: "neutral" };

function StatusIcon({ status }: { readonly status: ExportJobStatus }) {
  if (status === "READY") return <CheckCircle2 aria-hidden="true" className="size-4" />;
  if (status === "FAILED") return <XCircle aria-hidden="true" className="size-4" />;
  if (status === "EXPIRED") return <Hourglass aria-hidden="true" className="size-4" />;
  return <RotateCw aria-hidden="true" className="size-4 motion-safe:animate-spin" />;
}

export function CsvPreviewTable({ rows, caption }: { readonly rows: readonly (readonly string[])[]; readonly caption: string }) {
  const [header, ...body] = rows;
  if (header === undefined) return null;
  return (
    <div className="max-h-72 overflow-auto rounded-controls border border-[var(--ar-border)]">
      <table className="w-full text-left text-xs" data-testid="csv-preview">
        <caption className="sr-only">{caption}</caption>
        <thead className="sticky top-0 bg-[var(--ar-surface-muted)]">
          <tr>
            {header.map((cell, i) => (
              <th className="whitespace-nowrap px-3 py-2 font-semibold" key={`${i}-${cell}`} scope="col">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, r) => (
            <tr className="border-t border-[var(--ar-border)]" key={r}>
              {row.map((cell, c) => (
                <td className="whitespace-pre px-3 py-2 font-mono" key={c}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Status, download and preview for one background export job (EC-OPS-11). */
export function ExportJobCard({ jobId, initial, onReady }: { readonly jobId: string; readonly initial?: ExportJob; readonly onReady?: (job: ExportJob) => void }) {
  const t = useTranslations("ops.exports");
  const locale = useLocale();
  const query = useExportJob(jobId);
  const job = query.data ?? initial;
  const notified = useRef(false);
  const [preview, setPreview] = useState<string[][] | null>(null);

  useEffect(() => {
    if (job?.status === "READY" && !notified.current) {
      notified.current = true;
      onReady?.(job);
    }
  }, [job, onReady]);

  if (job === undefined) return null;
  const working = job.status === "QUEUED" || job.status === "RUNNING";

  const loadPreview = async () => {
    if (job.downloadUrl === null) return;
    const response = await fetch(job.downloadUrl, { credentials: "same-origin" });
    setPreview(parseCsvPreview(await response.text()));
  };

  return (
    <div className="rounded-cards border border-[var(--ar-border)] bg-[var(--ar-surface)] p-4" data-testid={`export-job-${job.id}`}>
      <div className="flex flex-wrap items-center gap-2">
        <FileSpreadsheet aria-hidden="true" className="size-5" />
        <span className="font-semibold">{t(`entity.${job.entity}`)}</span>
        <Badge icon={<StatusIcon status={job.status} />} tone={STATUS_TONE[job.status]}>
          {t(`status.${job.status}`)}
        </Badge>
      </div>
      {working ? (
        <div className="mt-2" role="status">
          <p className="font-semibold">{t("started.title")}</p>
          <p className="text-sm text-[var(--ar-text-muted)]">{t("started.body")}</p>
        </div>
      ) : null}
      {job.status === "READY" && job.downloadUrl !== null ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <a className="inline-flex min-h-12 items-center gap-2 rounded-controls bg-[var(--ar-primary)] px-4 font-semibold text-[var(--ar-on-primary)] hover:bg-[var(--ar-primary-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ar-focus)]" download href={job.downloadUrl}>
            <Download aria-hidden="true" className="size-4" />
            {t("download")}
          </a>
          <Button onClick={() => void loadPreview()} variant="secondary">
            {t("preview")}
          </Button>
          {job.expiresAt === null ? null : <span className="text-sm text-[var(--ar-text-muted)]">{t("expiresAt", { at: formatDateTime(job.expiresAt, locale) })}</span>}
        </div>
      ) : null}
      {job.status === "FAILED" ? <p className="mt-2 text-sm">{t("failed")}</p> : null}
      {job.status === "EXPIRED" ? <p className="mt-2 text-sm">{t("expired")}</p> : null}
      {preview === null ? null : (
        <div className="mt-3">
          <CsvPreviewTable caption={t("previewCaption")} rows={preview} />
        </div>
      )}
    </div>
  );
}

export interface ExportButtonProps {
  readonly entity: ExportEntity;
  readonly filters?: ExportFilters;
  readonly label?: string;
  /** Injected in tests; defaults to the T05 `startExport` helper. */
  readonly start?: (entity: ExportEntity, filters: ExportFilters, locale: string) => Promise<ExportStart>;
}

/**
 * Export entry point: small exports download at once and show a preview of the first rows; big
 * ones become a background job with status, one ready notice and a 7-day download link.
 */
export function ExportButton({ entity, filters = {}, label, start = startExport }: ExportButtonProps) {
  const t = useTranslations("ops.exports");
  const locale = useLocale();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [job, setJob] = useState<ExportJob | null>(null);
  const [preview, setPreview] = useState<string[][] | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    setPreview(null);
    try {
      const result = await start(entity, filters, locale);
      if (result.kind === "job") setJob(result.job);
      else {
        setJob(null);
        setPreview(parseCsvPreview(await readBlobText(result.blob)));
        downloadBlob(result.blob, result.fileName);
      }
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div>
        <Button busy={busy} icon={<Download aria-hidden="true" className="size-4" />} onClick={() => void run()} variant="secondary">
          {label ?? t("button")}
        </Button>
      </div>
      {error === null ? null : <ErrorAlert error={error} onRetry={() => void run()} />}
      {job === null ? null : <ExportJobCard initial={job} jobId={job.id} onReady={() => toast.success(t("ready"))} />}
      {preview === null ? null : (
        <div>
          <p className="mb-2 text-sm font-semibold">{t("previewTitle")}</p>
          <CsvPreviewTable caption={t("previewCaption")} rows={preview} />
        </div>
      )}
    </div>
  );
}
