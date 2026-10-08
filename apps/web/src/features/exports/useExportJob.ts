"use client";

import { useQuery } from "@tanstack/react-query";

import { getExportJob, isTerminal, type ExportJob } from "./api";

export const EXPORT_POLL_MS = 3_000;

/** Polls an export job until it is READY, FAILED or EXPIRED. */
export function useExportJob(id: string | null) {
  return useQuery<ExportJob>({
    queryKey: ["exports", id],
    queryFn: ({ signal }) => getExportJob(id ?? "", signal),
    enabled: id !== null,
    refetchInterval: (query) => (query.state.data !== undefined && isTerminal(query.state.data.status) ? false : EXPORT_POLL_MS),
  });
}
