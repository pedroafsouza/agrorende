import { useRouter } from "expo-router";
import { AlarmClock, ArrowDownToLine, ArrowUpFromLine, Truck } from "lucide-react-native";

import { useServices } from "../../lib/services";
import { useLocalQuery } from "../../lib/useLocalQuery";
import { Card, ListItem, Text } from "../../ui";
import "./i18n";
import { listOpenRentals, loadOrgRentalSettings, sectionCounts, sectionRentals } from "./logic";

/** Home (§13.2): today's hand-overs, returns and overdue rentals; tapping opens the Rentals tab. */
export function RentalsTodayCard() {
  const router = useRouter();
  const services = useServices();
  const query = useLocalQuery(async (db) => {
    const settings = await loadOrgRentalSettings(db);
    return sectionCounts(sectionRentals(await listOpenRentals(db), services.now?.() ?? Date.now(), settings.timeZone, settings.graceHours));
  }, []);
  const open = () => router.push("/rentals");
  if (query.status !== "ready") {
    return (
      <Card testID="home-rentals-today">
        <ListItem titleKey="rentals.widget.title" subtitleKey={query.status === "error" ? "rentals.widget.unavailable" : "rentals.widget.loading"} icon={Truck} onPress={open} />
      </Card>
    );
  }
  const counts = query.data;
  return (
    <Card testID="home-rentals-today">
      <ListItem testID="home-rentals-today-open" titleKey="rentals.widget.title" icon={Truck} onPress={open} />
      <ListItem testID="home-rentals-today-handovers" icon={ArrowUpFromLine} titleKey="rentals.widget.handOvers" right={<Text testID="home-rentals-today-handovers-count" variant="heading">{String(counts.handOvers)}</Text>} />
      <ListItem testID="home-rentals-today-returns" icon={ArrowDownToLine} titleKey="rentals.widget.returns" right={<Text testID="home-rentals-today-returns-count" variant="heading">{String(counts.returns)}</Text>} />
      <ListItem
        testID="home-rentals-today-overdue"
        icon={AlarmClock}
        danger={counts.overdue > 0}
        titleKey="rentals.widget.overdue"
        right={<Text testID="home-rentals-today-overdue-count" variant="heading" tone={counts.overdue > 0 ? "danger" : "body"}>{String(counts.overdue)}</Text>}
      />
    </Card>
  );
}
