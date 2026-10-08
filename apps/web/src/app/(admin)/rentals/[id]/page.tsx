import { RentalDetailPage } from "@/features/rentals/RentalDetailPage";
import { RentalsIntl } from "@/features/rentals/RentalsIntl";

export default async function RentalPage({ params }: { readonly params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <RentalsIntl>
      <RentalDetailPage id={id} />
    </RentalsIntl>
  );
}
