import { api } from "@/lib/api";

import type { PlotBoundariesDTO } from "@agrorende/core/modules/ops/boundaries";

import type { OperatorTrailDTO, OpsActivityDTO, OpsAlertsDTO, OpsKpisDTO, OpsLiveDTO } from "./types";

export const opsApi = {
  live: (signal?: AbortSignal) => api<OpsLiveDTO>("/ops/live", signal === undefined ? {} : { signal }),
  kpis: (range: string, signal?: AbortSignal) => api<OpsKpisDTO>("/ops/kpis", { query: { range }, ...(signal === undefined ? {} : { signal }) }),
  alerts: (signal?: AbortSignal) => api<OpsAlertsDTO>("/ops/alerts", signal === undefined ? {} : { signal }),
  activity: (cursor: string | null, signal?: AbortSignal) => api<OpsActivityDTO>("/ops/activity", { query: { cursor, limit: 30 }, ...(signal === undefined ? {} : { signal }) }),
  boundaries: (signal?: AbortSignal) => api<PlotBoundariesDTO>("/ops/boundaries", signal === undefined ? {} : { signal }),
  trail: (userId: string, signal?: AbortSignal) => api<OperatorTrailDTO>(`/ops/operators/${userId}/trail`, signal === undefined ? {} : { signal }),
};
