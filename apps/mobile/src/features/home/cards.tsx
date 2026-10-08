import { useRouter, type Href } from "expo-router";
import { CalendarClock, ClipboardList, FilePlus2, Truck, type LucideIcon } from "lucide-react-native";

import type { MessageKey } from "../../i18n/messages";
import { ListItem } from "../../ui";
import { Card } from "../../ui/Card";

export { DutyCard } from "./DutyCard";
export { SyncCard } from "./SyncCard";

function LinkCard({ titleKey, subtitleKey, icon, href, testID }: { readonly titleKey: MessageKey; readonly subtitleKey: MessageKey; readonly icon: LucideIcon; readonly href: Href; readonly testID: string }) {
  const router = useRouter();
  return (
    <Card testID={testID}>
      <ListItem titleKey={titleKey} subtitleKey={subtitleKey} icon={icon} onPress={() => router.push(href)} />
    </Card>
  );
}

/**
 * Entry cards for features owned by later tasks. Each links to its tab, so Today always works;
 * the owning task may export a richer card from its own feature folder (change request T03-003).
 */
export function QuickReportCard() {
  return <LinkCard testID="home-quick-report" titleKey="ui.home.quickReport" subtitleKey="ui.home.quickReportBody" icon={FilePlus2} href="/reports/new" />;
}

export function NextJobCard() {
  return <LinkCard testID="home-next-job" titleKey="ui.home.nextJob" subtitleKey="ui.home.nextJobBody" icon={ClipboardList} href="/jobs" />;
}

export function RentalsTodayCard() {
  return <LinkCard testID="home-rentals-today" titleKey="ui.home.rentalsToday" subtitleKey="ui.home.rentalsTodayBody" icon={Truck} href="/rentals" />;
}

export function MyReportsCard() {
  return <LinkCard testID="home-my-reports" titleKey="ui.home.myReports" subtitleKey="ui.home.myReportsBody" icon={CalendarClock} href="/reports" />;
}
