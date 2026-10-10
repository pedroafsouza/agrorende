"use client";

import { useQuery } from "@tanstack/react-query";

import type { SubscriptionDTO } from "@agrorende/core/modules/tenancy/dto";

import type { WorkOrderListItem } from "@/features/work-orders/types";
import { api } from "@/lib/api";
import type { ListPage } from "@/lib/forms";

export const GUIDE_TASKS = ["machine", "team", "workOrder", "app"] as const;
export type GuideTask = (typeof GUIDE_TASKS)[number];

export const SUBSCRIPTION_QUERY_KEY = ["org", "subscription"] as const;
export const FIRST_WORK_ORDER_QUERY_KEY = ["work-orders", { guide: true }] as const;

/**
 * Progress of the guided first run, derived from real data: the organisation's getting-started
 * steps (machines, invites, connected phones) and whether any work order exists. ADMIN only,
 * because `GET /org/subscription` is.
 */
export function useGuideProgress(enabled: boolean) {
  const subscription = useQuery({
    queryKey: SUBSCRIPTION_QUERY_KEY,
    queryFn: () => api<SubscriptionDTO>("/org/subscription"),
    enabled,
  });
  const workOrders = useQuery({
    queryKey: FIRST_WORK_ORDER_QUERY_KEY,
    queryFn: () => api<ListPage<WorkOrderListItem>>("/work-orders", { query: { limit: 1 } }),
    enabled,
  });
  const steps = subscription.data?.gettingStarted.steps ?? [];
  const stepDone = (id: string) => steps.some((step) => step.id === id && step.completed);
  const tasks: Record<GuideTask, boolean> = {
    machine: stepDone("assets"),
    team: stepDone("team"),
    workOrder: (workOrders.data?.items.length ?? 0) > 0,
    app: stepDone("app"),
  };
  const done = GUIDE_TASKS.filter((task) => tasks[task]).length;
  return {
    isLoading: subscription.isLoading || workOrders.isLoading,
    isReady: subscription.data !== undefined && workOrders.data !== undefined,
    error: subscription.error ?? workOrders.error,
    refetch: () => {
      void subscription.refetch();
      void workOrders.refetch();
    },
    tasks,
    done,
    total: GUIDE_TASKS.length,
    complete: done === GUIDE_TASKS.length,
  } as const;
}
