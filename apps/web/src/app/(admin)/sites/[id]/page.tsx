import { SiteDetailPage } from "@/features/sites/SiteDetailPage";

export default async function SitePage({ params }: { readonly params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SiteDetailPage id={id} />;
}
