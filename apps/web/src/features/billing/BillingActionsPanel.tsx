"use client";

import { useQuery } from "@tanstack/react-query";
import { FilePlus2, ReceiptText } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { ErrorAlert } from "@/components/recovery/ErrorAlert";
import { Button, buttonVariants } from "@/components/ui/Button";
import { api, isApiError } from "@/lib/api";

import { BillingCreateDialog } from "./BillingCreateDialog";
import { sourceQuery, type BillingLineDTO } from "./types";

export interface BillingPreview {
  readonly lines: BillingLineDTO[];
  readonly customerId: string | null;
  readonly existingId: string | null;
}

/** Codes that mean "this source cannot be billed": the panel stays out of the way instead of showing an error. */
const NOT_BILLABLE = new Set(["WO_CANCELLED", "INVALID_TRANSITION", "NOT_FOUND"]);

/**
 * Billing on a source detail page (ERP-08). A work order offers "Create billing document" with the
 * lines prefilled; a rental is billed by its close (RN-10), so it only links to its document.
 * An active document for the source turns the action into a link, so nothing is billed twice.
 */
export function BillingActionsPanel({ entityType, entityId }: { readonly entityType: "WORK_ORDER" | "RENTAL"; readonly entityId: string }) {
  const t = useTranslations("billing");
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const preview = useQuery({
    queryKey: ["billing", "preview", entityType, entityId],
    queryFn: () => api<BillingPreview>("/billing-documents/preview", { query: sourceQuery(entityType, entityId) }),
    retry: false,
  });
  if (preview.isLoading) return null;
  if (preview.error !== null) {
    if (isApiError(preview.error) && NOT_BILLABLE.has(preview.error.code)) return null;
    return (
      <section aria-label={t("panel.title")} className="mt-6">
        <ErrorAlert compact error={preview.error} onRetry={() => void preview.refetch()} />
      </section>
    );
  }
  const data = preview.data;
  if (data === undefined) return null;
  if (data.existingId === null && entityType === "RENTAL") return null;
  return (
    <section aria-labelledby="billing-panel" className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-cards border border-[var(--ar-border)] bg-[var(--ar-surface)] p-4">
      <div className="flex flex-col">
        <h2 className="flex items-center gap-2 text-lg font-semibold" id="billing-panel">
          <ReceiptText aria-hidden="true" className="size-5" />
          {t("panel.title")}
        </h2>
        <p className="text-sm text-[var(--ar-text-muted)]">{data.existingId === null ? t("panel.noneBody") : t("panel.existsBody")}</p>
      </div>
      {data.existingId === null ? (
        <Button icon={<FilePlus2 aria-hidden="true" className="size-4" />} onClick={() => setCreating(true)} variant="primary">
          {t("actions.createFromSource")}
        </Button>
      ) : (
        <Link className={buttonVariants({ variant: "secondary" })} href={`/billing/${data.existingId}`}>
          <ReceiptText aria-hidden="true" className="size-4" />
          {t("actions.open")}
        </Link>
      )}
      {creating ? (
        <BillingCreateDialog
          onClose={() => setCreating(false)}
          onCreated={(doc) => {
            setCreating(false);
            router.push(`/billing/${doc.id}`);
          }}
          prefill={{ lines: data.lines, customerId: data.customerId }}
          source={sourceQuery(entityType, entityId)}
        />
      ) : null}
    </section>
  );
}
