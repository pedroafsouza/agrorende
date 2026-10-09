import type { RentalCheckinPayload, RentalCheckoutPayload } from "@agrorende/contracts/mutations";
import { formatDateTime } from "@agrorende/i18n";
import { useRouter } from "expo-router";
import { ArrowDownToLine, ArrowUpFromLine, CalendarRange, IdCard, Phone, SearchX, Tractor, UserRound } from "lucide-react-native";
import { useSyncExternalStore } from "react";
import { Linking, StyleSheet, View } from "react-native";

import { authStore } from "../../auth/session";
import { useLocale, useT } from "../../i18n/useT";
import { loadDraft } from "../../lib/drafts";
import { useServices } from "../../lib/services";
import { useLocalQuery } from "../../lib/useLocalQuery";
import { Banner, Button, Card, EmptyState, ErrorState, ListItem, OfflineBanner, Screen, Skeleton, StatusPill, Text } from "../../ui";
import { checkinRental, checkoutRental } from "../../sync/mutators/rentals";
import { AskOfficeButton } from "../../ui/recovery";
import { CommentThread } from "../comments";
import { findMeterJumpConflict, replaceRejected, type MeterJumpConflict } from "../jobs/meterJump";
import { MeterJumpReview, type MeterJumpResubmit } from "../jobs/MeterJumpReview";
import "./i18n";
import { canCheckIn, canCheckOut, displayTaxId, draftIdFor, getRentalDetail, isOverdue, STATUS_TONE } from "./logic";

/** Rental detail (§13.1): customer, machine, dates, status and the one next action (check out or check in). */
export function RentalDetailScreen({ rentalId }: { readonly rentalId: string }) {
  const router = useRouter();
  const services = useServices();
  const locale = useLocale();
  const t = useT();
  const auth = useSyncExternalStore(authStore.subscribe, authStore.getState);
  const query = useLocalQuery(
    async (db) => {
      const detail = await getRentalDetail(db, rentalId);
      const checkoutDraft = await loadDraft(db, draftIdFor("CHECK_OUT", rentalId));
      const checkinDraft = await loadDraft(db, draftIdFor("CHECK_IN", rentalId));
      const meterJump = await findMeterJumpConflict(db, "RENTAL", rentalId);
      return { detail, hasDraft: checkoutDraft !== undefined || checkinDraft !== undefined, meterJump };
    },
    [rentalId],
  );

  if (query.status === "loading") return <Screen testID="rental-loading"><Skeleton lines={8} /></Screen>;
  if (query.status === "error") return <Screen testID="rental-error"><ErrorState onRetry={query.reload} /></Screen>;
  const { detail, hasDraft, meterJump } = query.data;
  if (detail === undefined) {
    return (
      <Screen testID="rental-not-found">
        <EmptyState icon={SearchX} titleKey="errors.RENTAL_NOT_FOUND.title" bodyKey="errors.RENTAL_NOT_FOUND.body" action={{ labelKey: "rentals.detail.backToList", onPress: () => router.replace("/rentals") }} />
      </Screen>
    );
  }

  const { summary, customer, snapshot, settings } = detail;
  const tz = settings.timeZone;
  const now = services.now?.() ?? Date.now();
  const overdue = summary.status === "ACTIVE" && summary.plannedEnd.length > 0 && isOverdue(summary.plannedEnd, now, settings.graceHours);
  const taxId = displayTaxId(auth.user?.role, customer, snapshot);
  const phone = typeof customer?.phone === "string" && customer.phone.length > 0 ? customer.phone : null;
  const fmt = (iso: string | null) => (iso === null || iso.length === 0 ? "—" : formatDateTime(iso, locale, { timeZone: tz }));
  const checkout = canCheckOut(summary.status);
  const checkin = canCheckIn(summary.status);
  const resumeKey = hasDraft ? "rentals.detail.resume" : checkout ? "rentals.detail.checkOut" : "rentals.detail.checkIn";

  const resubmitInspection = async (conflict: MeterJumpConflict, { reading, confirmJump }: MeterJumpResubmit) => {
    const db = services.db;
    if (db === undefined) return;
    await replaceRejected(
      db,
      conflict,
      () => {
        const body = conflict.payload as RentalCheckoutPayload | RentalCheckinPayload;
        const { meterJumpConfirmed: _previous, ...rest } = body.inspection;
        const inspection = { ...rest, ...(reading === null ? {} : { hourMeter: reading }), ...(confirmJump ? { meterJumpConfirmed: true } : {}) };
        return conflict.name === "rental.checkout"
          ? checkoutRental({ ...(body as RentalCheckoutPayload), inspection: inspection as RentalCheckoutPayload["inspection"] })
          : checkinRental({ ...(body as RentalCheckinPayload), inspection });
      },
      new Date(now).toISOString(),
    );
  };

  const footer =
    checkout || checkin ? (
      <Button
        testID={checkout ? "rental-checkout" : "rental-checkin"}
        icon={checkout ? ArrowUpFromLine : ArrowDownToLine}
        labelKey={resumeKey}
        onPress={() => router.push(`/rentals/${rentalId}/${checkout ? "checkout" : "checkin"}`)}
      />
    ) : undefined;

  return (
    <Screen
      testID="rental-detail"
      footer={footer}
      onRefresh={query.reload}
      refreshing={false}
      banner={
        <View style={styles.stack}>
          <OfflineBanner />
          {overdue ? (
            <Banner
              testID="rental-overdue"
              tone="error"
              titleKey="errors.RENTAL_OVERDUE.title"
              bodyKey="errors.RENTAL_OVERDUE.body"
              action={{ labelKey: "rentals.detail.checkInNow", onPress: () => router.push(`/rentals/${rentalId}/checkin`) }}
              {...(phone === null ? {} : { secondaryAction: { labelKey: "rentals.detail.callCustomer", onPress: () => void Linking.openURL(`tel:${phone}`) } })}
            />
          ) : null}
          {meterJump === undefined || services.db === undefined ? null : (
            <MeterJumpReview ns="rentals" testID="rental-meter-jump" conflict={meterJump} onResubmit={(input) => resubmitInspection(meterJump, input)} />
          )}
          {hasDraft ? <Banner testID="rental-draft" tone="info" titleKey="errors.RENTAL_DRAFT_INTERRUPTED.title" bodyKey="errors.RENTAL_DRAFT_INTERRUPTED.body" /> : null}
        </View>
      }
    >
      <View style={styles.head}>
        <Text variant="title" accessibilityRole="header">{summary.number ?? t("rentals.row.noNumber")}</Text>
        <View style={styles.pills}>
          {overdue ? <StatusPill testID="rental-status" labelKey="rentals.status.OVERDUE" tone="danger" /> : <StatusPill testID="rental-status" labelKey={`rentals.status.${summary.status}`} tone={STATUS_TONE[summary.status]} />}
          {summary.pending ? <StatusPill labelKey="rentals.list.pending" tone="warning" /> : null}
        </View>
      </View>
      <Card>
        <Text i18nKey="rentals.detail.customer" variant="label" />
        <ListItem testID="rental-customer" icon={UserRound} title={summary.customerName.length > 0 ? summary.customerName : "—"} />
        {taxId === null ? null : <ListItem testID="rental-tax-id" icon={IdCard} titleKey="rentals.detail.taxId" subtitle={taxId} />}
        {phone === null ? null : <ListItem testID="rental-call" icon={Phone} titleKey="rentals.detail.callCustomer" subtitle={phone} onPress={() => void Linking.openURL(`tel:${phone}`)} />}
      </Card>
      <Card>
        <Text i18nKey="rentals.detail.machine" variant="label" />
        <ListItem
          testID="rental-asset"
          icon={Tractor}
          title={summary.assetName.length > 0 ? summary.assetName : "—"}
          {...(summary.assetCode === null ? {} : { subtitle: summary.assetCode })}
          onPress={() => router.push(`/assets/${summary.assetId}`)}
        />
      </Card>
      <Card>
        <Text i18nKey="rentals.detail.dates" variant="label" />
        <ListItem icon={CalendarRange} titleKey="rentals.detail.planned" subtitle={`${fmt(summary.plannedStart)} → ${fmt(summary.plannedEnd)}`} />
        {summary.actualStart === null ? null : <ListItem icon={ArrowUpFromLine} titleKey="rentals.detail.handedOver" subtitle={fmt(summary.actualStart)} />}
        {summary.actualEnd === null ? null : <ListItem icon={ArrowDownToLine} titleKey="rentals.detail.returned" subtitle={fmt(summary.actualEnd)} />}
      </Card>
      {summary.status === "RETURNED" ? <Text testID="rental-returned-note" i18nKey="rentals.detail.returnedNote" tone="secondary" /> : null}
      {checkout || checkin ? null : <AskOfficeButton code="RENTAL_NOT_ACTIVE" entityType="RENTAL" entityId={rentalId} {...(summary.number === null ? {} : { reference: summary.number })} compact />}
      <CommentThread entityType="RENTAL" entityId={rentalId} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { alignItems: "center", flexDirection: "row", gap: 12, justifyContent: "space-between" },
  pills: { alignItems: "flex-end", gap: 4 },
  stack: { gap: 8 },
});
