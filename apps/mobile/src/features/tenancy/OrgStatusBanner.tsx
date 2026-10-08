import { Banner } from "../../ui";

export type OrgStatusBannerProps = {
  readonly status: "TRIAL" | "ACTIVE" | "PAST_DUE" | "SUSPENDED" | "CANCELLED";
};

/**
 * Field users only see a banner when the company's access is paused (EC-PLT-40).
 * Recording keeps working offline; the outbox sends once the organisation is writable again.
 */
export function orgStatusShowsBanner(status: OrgStatusBannerProps["status"]): boolean {
  return status === "SUSPENDED" || status === "CANCELLED";
}

export function OrgStatusBanner({ status }: OrgStatusBannerProps) {
  if (!orgStatusShowsBanner(status)) return null;
  return <Banner testID="org-status-banner" tone="warning" titleKey="tenancy.orgStatusBanner.title" bodyKey="tenancy.orgStatusBanner.body" />;
}
