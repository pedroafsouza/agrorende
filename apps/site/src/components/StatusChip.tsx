import { CircleCheck, Clock3, RefreshCw } from "lucide-react";

export type ChipStatus = "pending" | "progress" | "success";

const STYLES: Record<ChipStatus, string> = {
  pending: "border-warning text-warning",
  progress: "border-info text-info",
  success: "border-success text-success",
};

const ICONS = { pending: Clock3, progress: RefreshCw, success: CircleCheck } as const;

/** Status is always colour + icon + word (ARCHITECTURE §3.7). */
export function StatusChip({ status, label }: { readonly status: ChipStatus; readonly label: string }) {
  const Icon = ICONS[status];
  return (
    <span
      className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border-2 bg-bg px-3 text-sm font-semibold ${STYLES[status]}`}
    >
      <Icon aria-hidden="true" className="size-4" strokeWidth={2.25} />
      {label}
    </span>
  );
}
