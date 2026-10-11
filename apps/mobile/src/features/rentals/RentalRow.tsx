import { formatDateTime } from "@agrorende/i18n";
import { useRouter } from "expo-router";
import { AlarmClock, ArrowDownToLine, ArrowUpFromLine, Truck, type LucideIcon } from "lucide-react-native";

import { useLocale, useT } from "../../i18n/useT";
import { ListItem, StatusPill } from "../../ui";
import "./i18n";
import { STATUS_TONE, type RentalSummary } from "./logic";

export type RentalRowKind = "handOver" | "return" | "overdue" | "active" | "upcoming";

const ICONS: Readonly<Record<RentalRowKind, LucideIcon>> = {
  handOver: ArrowUpFromLine,
  return: ArrowDownToLine,
  overdue: AlarmClock,
  active: Truck,
  upcoming: ArrowUpFromLine,
};

/** One rental: machine, customer, the relevant date and status (icon + text, never colour alone). */
export function RentalRow({ rental, kind, timeZone }: { readonly rental: RentalSummary; readonly kind: RentalRowKind; readonly timeZone: string }) {
  const router = useRouter();
  const locale = useLocale();
  const t = useT();
  const when = kind === "handOver" || kind === "upcoming" ? rental.plannedStart : rental.plannedEnd;
  const whenText = when.length === 0 ? "" : formatDateTime(when, locale, { timeZone });
  const whenLabel = kind === "handOver" || kind === "upcoming" ? t("rentals.row.starts", { when: whenText }) : t("rentals.row.ends", { when: whenText });
  const title = [rental.number, rental.assetName].filter((part) => part !== null && part.length > 0).join(" · ");
  return (
    <ListItem
      testID={`rental-row-${rental.id}`}
      icon={ICONS[kind]}
      danger={kind === "overdue"}
      title={title.length > 0 ? title : t("rentals.row.noNumber")}
      subtitle={[rental.customerName, whenLabel].filter((part) => part.length > 0).join(" · ")}
      badges={
        <>
          {kind === "overdue" ? <StatusPill labelKey="rentals.status.OVERDUE" tone="danger" /> : <StatusPill labelKey={`rentals.status.${rental.status}`} tone={STATUS_TONE[rental.status]} />}
          {rental.pending ? <StatusPill labelKey="rentals.list.pending" tone="warning" /> : null}
        </>
      }
      onPress={() => router.push(`/rentals/${rental.id}`)}
    />
  );
}
