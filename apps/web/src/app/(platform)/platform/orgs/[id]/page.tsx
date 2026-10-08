import { PlatformOrgDetailPage } from "@/features/platform/PlatformOrgDetailPage";

export default async function PlatformOrgDetailRoute({ params }: { readonly params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PlatformOrgDetailPage id={id} />;
}
