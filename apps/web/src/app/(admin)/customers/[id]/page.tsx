import { CustomerDetailPage } from "@/features/customers/CustomerDetailPage";

export default async function CustomerPage({ params }: { readonly params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CustomerDetailPage id={id} />;
}
