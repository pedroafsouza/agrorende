export type OrgStatusBannerTone = "trial" | "active" | "past_due" | "suspended" | "cancelled";

export interface OrgStatusBannerProps {
  readonly tone: OrgStatusBannerTone;
  readonly title: string;
  readonly body: string;
  readonly actionLabel?: string;
}

const toneClassName = {
  trial: "border-info text-info",
  active: "border-success text-success",
  past_due: "border-warning text-warning",
  suspended: "border-danger text-danger",
  cancelled: "border-neutral text-neutral",
} satisfies Record<OrgStatusBannerTone, string>;

export function OrgStatusBanner({ actionLabel, body, title, tone }: OrgStatusBannerProps) {
  return (
    <section className={`rounded-cards border bg-white p-4 ${toneClassName[tone]}`}>
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mt-2 text-sm">{body}</p>
      {actionLabel === undefined ? null : (
        <button className="mt-3 min-h-touch rounded-controls border px-4 text-sm font-semibold" type="button">{actionLabel}</button>
      )}
    </section>
  );
}
