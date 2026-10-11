"use client";

import type { ProviderInviteDTO, ProviderInviteIssuedDTO } from "@agrorende/contracts";
import { useQuery } from "@tanstack/react-query";
import { Globe2, Send, UserPlus, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type ReactElement, type ReactNode } from "react";
import { toast } from "sonner";

import { LoadingState } from "@/components/data/States";
import { ErrorAlert } from "@/components/recovery/ErrorAlert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { AssignDialog } from "@/features/work-orders/AssignDialog";
import { officeActions, type WorkOrderDetail } from "@/features/work-orders/types";
import { api } from "@/lib/api";

import { InviteCard } from "./InviteCard";
import { InviteDialog, ShareCard } from "./InviteDialog";
import { InviteStatusBadge, ProvidersIntl } from "./shared";

const ACTIVE = new Set(["SENT", "OPENED", "COUNTERED", "ACCEPTED"]);
const CLOSED_WORK_ORDER = new Set(["CANCELLED", "COMPLETED", "VERIFIED"]);

export interface ProvidersPanelProps {
  readonly workOrderId: string;
}

/** "Quem vai atender?" on the work order page: my team, the AgroRende network (phase 2) or an outside invite (#63). */
export function ProvidersPanel(props: ProvidersPanelProps): ReactElement {
  return (
    <ProvidersIntl>
      <Panel {...props} />
    </ProvidersIntl>
  );
}

function Option({ icon, title, body, children, muted = false }: { readonly icon: ReactNode; readonly title: string; readonly body: string; readonly children: ReactNode; readonly muted?: boolean }): ReactElement {
  return (
    <li className={`flex flex-col gap-2 rounded-cards border p-4 ${muted ? "border-dashed border-[var(--ar-border)] bg-[var(--ar-surface-muted)]" : "border-[var(--ar-border-strong)] bg-[var(--ar-surface)]"}`}>
      <p className="flex items-center gap-2 font-semibold">
        {icon}
        {title}
      </p>
      <p className="flex-1 text-sm text-[var(--ar-text-muted)]">{body}</p>
      {children}
    </li>
  );
}

function Panel({ workOrderId }: ProvidersPanelProps): ReactElement | null {
  const t = useTranslations("providers.panel");
  const jobs = useTranslations("jobs");
  const toasts = useTranslations("providers.toast");
  const detail = useQuery({ queryKey: ["work-orders", workOrderId, "detail"], queryFn: () => api<WorkOrderDetail>(`/work-orders/${workOrderId}`, { query: { include: "detail" } }) });
  const invites = useQuery({ queryKey: ["work-orders", workOrderId, "provider-invites"], queryFn: () => api<{ items: ProviderInviteDTO[] }>(`/work-orders/${workOrderId}/provider-invites`) });
  const [dialog, setDialog] = useState<"invite" | "assign" | "reassign" | null>(null);
  const [issued, setIssued] = useState<ProviderInviteIssuedDTO | null>(null);

  if (detail.data === undefined) return null;
  const wo = detail.data.workOrder;
  const teamAction = officeActions(wo).find((action): action is "assign" | "reassign" => action === "assign" || action === "reassign");
  const items = invites.data?.items ?? [];
  const current = items[0];
  const earlier = items.slice(1);
  const hasActive = items.some((item) => ACTIVE.has(item.status));
  const closed = CLOSED_WORK_ORDER.has(wo.status);

  return (
    <section aria-labelledby={`providers-${workOrderId}`} className="mt-6 flex flex-col gap-4 rounded-cards border border-[var(--ar-border)] bg-[var(--ar-surface)] p-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold" id={`providers-${workOrderId}`}>
          <Users aria-hidden="true" className="size-5" />
          {t("title")}
        </h2>
        <p className="text-sm text-[var(--ar-text-muted)]">{t("subtitle")}</p>
      </div>
      <ul className="grid gap-3 md:grid-cols-3">
        <Option body={t("team.body")} icon={<UserPlus aria-hidden="true" className="size-5" />} title={t("team.title")}>
          {teamAction === undefined ? (
            <p className="text-sm text-[var(--ar-text-muted)]">{t("team.unavailable")}</p>
          ) : (
            <Button icon={<UserPlus aria-hidden="true" className="size-4" />} onClick={() => setDialog(teamAction)}>
              {jobs(`actions.${teamAction}`)}
            </Button>
          )}
        </Option>
        <Option body={t("network.body")} icon={<Globe2 aria-hidden="true" className="size-5" />} muted title={t("network.title")}>
          <div>
            <Badge tone="neutral">{t("network.badge")}</Badge>
          </div>
        </Option>
        <Option body={t("external.body")} icon={<Send aria-hidden="true" className="size-5" />} title={t("external.title")}>
          {closed ? (
            <p className="text-sm text-[var(--ar-text-muted)]">{t("external.closed")}</p>
          ) : hasActive ? (
            <p className="text-sm text-[var(--ar-text-muted)]">{t("external.blocked")}</p>
          ) : (
            <Button icon={<Send aria-hidden="true" className="size-4" />} onClick={() => setDialog("invite")} variant="primary">
              {t("external.action")}
            </Button>
          )}
        </Option>
      </ul>

      {issued === null ? null : <ShareCard issued={issued} onClose={() => setIssued(null)} title={wo.title} />}

      {invites.isLoading ? <LoadingState rows={2} /> : null}
      {invites.error === null ? null : <ErrorAlert error={invites.error} onRetry={() => void invites.refetch()} />}
      {current === undefined ? null : <InviteCard invite={current} onIssued={setIssued} />}
      {earlier.length === 0 ? null : <EarlierInvites items={earlier} />}

      <InviteDialog
        onClose={() => setDialog(null)}
        onIssued={(result) => {
          setDialog(null);
          setIssued(result);
          toast.success(toasts("invited"));
        }}
        open={dialog === "invite"}
        workOrderId={workOrderId}
      />
      {dialog === "assign" || dialog === "reassign" ? (
        <AssignDialog
          mode={dialog}
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null);
            void detail.refetch();
            toast.success(jobs(`toast.${dialog}`));
          }}
          open
          workOrder={wo}
        />
      ) : null}
    </section>
  );
}

function EarlierInvites({ items }: { readonly items: readonly ProviderInviteDTO[] }): ReactElement {
  const t = useTranslations("providers.invite");
  return (
    <details className="rounded-cards border border-[var(--ar-border)] p-3">
      <summary className="flex min-h-12 cursor-pointer items-center font-semibold">{t("history")}</summary>
      <ul className="mt-2 flex flex-col gap-2">
        {items.map((item) => (
          <li className="flex flex-wrap items-center justify-between gap-2" key={item.id}>
            <span>{item.providerName}</span>
            <InviteStatusBadge status={item.status} />
          </li>
        ))}
      </ul>
    </details>
  );
}
