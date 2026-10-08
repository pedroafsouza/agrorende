import { PublicFrame } from "@/features/shell/auth/PublicFrame";
import { InvitePage } from "@/features/shell/auth/InvitePage";

export const dynamic = "force-dynamic";

export default async function InviteRoute({ params }: { readonly params: Promise<{ code: string }> }) {
  const { code } = await params;
  return (
    <PublicFrame>
      <InvitePage code={code} />
    </PublicFrame>
  );
}
