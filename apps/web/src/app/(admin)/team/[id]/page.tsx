import { UserDetailPage } from "@/features/team/UserDetailPage";

export default async function TeamUserPage({ params }: { readonly params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <UserDetailPage id={id} />;
}
