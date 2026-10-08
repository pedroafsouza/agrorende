import { Card, Text } from "../../ui";

export type OrgStatusBannerProps = {
  readonly status: "TRIAL" | "ACTIVE" | "PAST_DUE" | "SUSPENDED" | "CANCELLED";
};

export function OrgStatusBanner(_props: OrgStatusBannerProps) {
  return (
    <Card>
      <Text i18nKey="tenancy.orgStatusBanner.title" />
      <Text i18nKey="tenancy.orgStatusBanner.body" tone="secondary" />
    </Card>
  );
}
