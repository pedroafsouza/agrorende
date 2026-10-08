import { PublicFrame } from "@/features/shell/auth/PublicFrame";
import { ResetPage } from "@/features/shell/auth/ResetPage";

export const dynamic = "force-dynamic";

export default async function ResetRoute({ params }: { readonly params: Promise<{ code: string }> }) {
  const { code } = await params;
  return (
    <PublicFrame>
      <ResetPage code={code} />
    </PublicFrame>
  );
}
