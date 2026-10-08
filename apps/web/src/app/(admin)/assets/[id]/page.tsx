import { AssetDetailPage } from "@/features/assets/AssetDetailPage";

export default async function AssetPage({ params }: { readonly params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AssetDetailPage id={id} />;
}
