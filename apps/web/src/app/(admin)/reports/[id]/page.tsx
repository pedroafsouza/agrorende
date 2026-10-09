import { CommentThread } from "@/features/comments";
import { ReportDetailPage } from "@/features/reports/ReportDetailPage";
import { ReportsIntl } from "@/features/reports/ReportsIntl";

export default async function ReportPage({ params }: { readonly params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <ReportsIntl>
      <ReportDetailPage id={id} />
      <CommentThread entityId={id} entityType="FIELD_REPORT" />
    </ReportsIntl>
  );
}
