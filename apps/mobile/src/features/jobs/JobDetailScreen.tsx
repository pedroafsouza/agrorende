import type { HoldReason, Role, WorkOrderStatus } from "@agrorende/contracts/enums";
import type { WorkOrderCompletePayload } from "@agrorende/contracts/mutations";
import { useRouter } from "expo-router";
import { ClipboardCheck, FileQuestion, MapPin, MapPinCheck, MapPinX, Megaphone, Navigation, Package, Phone, Timer, Tractor, Wrench } from "lucide-react-native";
import { useState, useSyncExternalStore } from "react";
import { Linking, StyleSheet, View } from "react-native";

import { Thumbnails } from "../../components/MediaCapture";
import { authStore } from "../../auth/session";
import type { AppErrorCode } from "@agrorende/contracts/errors";
import { errorCodeOf } from "../../lib/errors";
import { openNavigation } from "../../lib/navigation";
import { useServices } from "../../lib/services";
import { createComment } from "../../sync/mutators/comments";
import { completeWorkOrder, transitionWorkOrder } from "../../sync/mutators/jobs";
import { getSyncRuntime } from "../../sync/runtime";
import { useT } from "../../i18n/useT";
import { Banner, BottomSheet, Button, Card, Chip, EmptyState, ErrorState, ListItem, Screen, Skeleton, StatusPill, Text, TextField, showToast } from "../../ui";
import { ErrorSheet } from "../../ui/recovery/ErrorSheet";
import { InlineError } from "../../ui/recovery/InlineError";
import { CommentThread } from "../comments";
import { loadUserSettings } from "../settings/logic";
import "./i18n";
import { pointUpdateText, type ArrivalTarget } from "./arrivalPrompt";
import { replaceRejected } from "./meterJump";
import { MeterJumpReview, type MeterJumpResubmit } from "./MeterJumpReview";
import { ACTION_LABEL, actionPlan, checklistOf, HOLD_REASONS, jobDestination, jobNotice, PRIORITY_TONE, STATUS_TONE, type JobStep } from "./logic";
import { useArrivalPrompt } from "./useArrivalPrompt";
import { useJob } from "./useJob";

type FieldAction = "accept" | "startRoute" | "arrive" | "abortRoute" | "startWork" | "resume";
const FIELD_ACTIONS: readonly JobStep[] = ["accept", "startRoute", "arrive", "abortRoute", "startWork", "resume"];

const NOTICE_TONE: Readonly<Partial<Record<AppErrorCode, "warning" | "error" | "info">>> = { WO_CANCELLED: "error", WO_REASSIGNED: "warning", WO_SAFETY_STOP_REQUIRED: "error" };

/** Job detail (WO-04, WO-05): one primary action from the state machine, navigation, links to checklist, parts and completion. */
export function JobDetailScreen({ id }: { readonly id: string }) {
  const router = useRouter();
  const { userId, db, now } = useServices();
  const role = useSyncExternalStore(authStore.subscribe, authStore.getState).user?.role as Role | undefined;
  const query = useJob(id);
  const [sheet, setSheet] = useState<"decline" | "hold" | undefined>();
  const [reason, setReason] = useState("");
  const [holdReason, setHoldReason] = useState<HoldReason | undefined>();
  const [sheetError, setSheetError] = useState<string | undefined>();
  const [errorCode, setErrorCode] = useState<AppErrorCode | undefined>();
  const [busy, setBusy] = useState(false);
  const t = useT();
  const loaded = query.status === "ready" ? query.data : undefined;
  const arrival = useArrivalPrompt(arrivalTarget(id, loaded?.workOrder, loaded?.site), now ?? Date.now);

  if (query.status === "loading") return <Screen testID="job-detail-loading"><Skeleton lines={8} /></Screen>;
  if (query.status === "error") return <Screen testID="job-detail-error"><ErrorState onRetry={query.reload} /></Screen>;
  if (query.data === undefined) {
    return (
      <Screen testID="job-detail-empty">
        <EmptyState icon={FileQuestion} titleKey="jobs.detail.notFoundTitle" bodyKey="jobs.detail.notFoundBody" action={{ labelKey: "jobs.detail.backToJobs", onPress: () => router.replace("/jobs") }} />
      </Screen>
    );
  }

  const { workOrder: wo, asset, site, customer, parts, localMedia, meterJump } = query.data;
  const status = String(wo.status ?? "ASSIGNED") as WorkOrderStatus;
  const priority = String(wo.priority ?? "MEDIUM") as keyof typeof PRIORITY_TONE;
  const plan = actionPlan({ status, assigneeId: typeof wo.assigneeId === "string" ? wo.assigneeId : null, holdReason: (wo.holdReason as HoldReason | null) ?? null }, userId, role);
  const notice = jobNotice(wo, asset, userId);
  const checklist = checklistOf(wo);
  const inField = plan.primary !== undefined || plan.secondary.length > 0;

  const run = async (step: JobStep) => {
    if (step === "complete") return router.push(`/jobs/${id}/complete`);
    if (step === "decline" || step === "hold") {
      setReason("");
      setHoldReason(undefined);
      setSheetError(undefined);
      return setSheet(step);
    }
    if (!FIELD_ACTIONS.includes(step)) return;
    setBusy(true);
    try {
      await transitionWorkOrder({ id, action: step as FieldAction });
      showToast({ messageKey: `jobs.toast.${step}`, tone: "success" });
    } catch (error) {
      setErrorCode(errorCodeOf(error) as AppErrorCode);
    } finally {
      setBusy(false);
    }
  };

  const submitSheet = async () => {
    if (sheet === "decline" && reason.trim().length < 3) return setSheetError("jobs.decline.reasonRequired");
    if (sheet === "hold" && holdReason === undefined) return setSheetError("jobs.hold.reasonRequired");
    try {
      if (sheet === "decline") await transitionWorkOrder({ id, action: "decline", reason: reason.trim() });
      if (sheet === "hold" && holdReason !== undefined) await transitionWorkOrder({ id, action: "hold", holdReason, ...(reason.trim().length > 0 ? { note: reason.trim() } : {}) });
      showToast({ messageKey: `jobs.toast.${sheet ?? "hold"}`, tone: "success" });
      setSheet(undefined);
      if (sheet === "decline") router.replace("/jobs");
    } catch (error) {
      setSheetError(`errors.${errorCodeOf(error)}.title`);
    }
  };

  const navigate = async () => {
    try {
      const destination = jobDestination(wo, site);
      const settings = db === undefined ? undefined : await loadUserSettings(db);
      await openNavigation(destination, settings?.navApp ?? "system");
    } catch (error) {
      setErrorCode(errorCodeOf(error) as AppErrorCode);
    }
  };

  const footer = (
    <View style={styles.footer}>
      {plan.primary === undefined ? null : <Button testID={`job-action-${plan.primary}`} labelKey={ACTION_LABEL[plan.primary]} loading={busy} haptic onPress={() => void run(plan.primary as JobStep)} />}
      {plan.secondary.map((step) => (
        <Button key={step} testID={`job-action-${step}`} labelKey={ACTION_LABEL[step]} variant={step === "decline" ? "danger" : "secondary"} onPress={() => void run(step)} />
      ))}
    </View>
  );

  return (
    <Screen
      testID="job-detail"
      onRefresh={query.reload}
      refreshing={false}
      footer={inField ? footer : undefined}
      banner={
        notice === undefined ? undefined : (
          <Banner
            testID={`job-notice-${notice}`}
            tone={NOTICE_TONE[notice] ?? "info"}
            titleKey={`errors.${notice}.title`}
            bodyKey={`errors.${notice}.body`}
            {...(notice === "WO_SAFETY_STOP_REQUIRED" ? { action: { labelKey: "jobs.actions.checklist", onPress: () => router.push(`/jobs/${id}/checklist`) } } : {})}
            {...(notice === "WO_CANCELLED" || notice === "WO_REASSIGNED" ? { action: { labelKey: "jobs.detail.backToJobs", onPress: () => router.replace("/jobs") } } : {})}
          />
        )
      }
    >
      {meterJump === undefined || db === undefined ? null : (
        <MeterJumpReview
          ns="jobs"
          testID="job-meter-jump"
          conflict={meterJump}
          onResubmit={({ reading, confirmJump }: MeterJumpResubmit) =>
            replaceRejected(
              db,
              meterJump,
              () => {
                const { confirmMeterJump: _previous, ...rest } = meterJump.payload as WorkOrderCompletePayload;
                return completeWorkOrder({ ...rest, ...(reading === null ? {} : { hourMeterReading: reading }), ...(confirmJump ? { confirmMeterJump: true } : {}) });
              },
              new Date(now?.() ?? Date.now()).toISOString(),
            )
          }
        />
      )}
      <Card>
        <Text variant="caption" tone="secondary">{typeof wo.number === "string" ? wo.number : ""}</Text>
        <Text variant="heading">{String(wo.title ?? "")}</Text>
        <View style={styles.pills}>
          <StatusPill testID="job-status" labelKey={`jobs.status.${status}`} tone={STATUS_TONE[status]} />
          <StatusPill labelKey={`jobs.priority.${priority}`} tone={PRIORITY_TONE[priority]} />
          {status === "ON_HOLD" && typeof wo.holdReason === "string" ? <StatusPill labelKey={`jobs.holdReason.${wo.holdReason}`} tone="warning" /> : null}
        </View>
        {typeof wo.description === "string" && wo.description.length > 0 ? <Text>{wo.description}</Text> : null}
      </Card>

      {asset === undefined ? null : <ListItem testID="job-asset" icon={Tractor} title={String(asset.name ?? "")} subtitle={[asset.code, asset.model].filter((v) => typeof v === "string").join(" · ")} onPress={() => router.push(`/assets/${String(asset.id)}`)} />}
      <ListItem testID="job-site" icon={MapPin} title={String(site?.name ?? customer?.name ?? "")} subtitle={String(wo.locationNote ?? site?.address ?? "")} right={<Button testID="job-navigate" compact icon={Navigation} labelKey="jobs.actions.navigate" variant="secondary" onPress={() => void navigate()} />} />
      {typeof customer?.phone === "string" ? <ListItem testID="job-call" icon={Phone} title={String(customer.name ?? "")} subtitle={customer.phone} onPress={() => void Linking.openURL(`tel:${String(customer.phone)}`)} /> : null}

      <ListItem
        testID="job-open-checklist"
        icon={ClipboardCheck}
        titleKey="jobs.actions.checklist"
        subtitleKey={checklist.items.length === 0 ? "jobs.detail.noChecklist" : "jobs.detail.checklistProgress"}
        subtitleValues={{ done: checklist.responses.filter((r) => r.value !== null).length, total: checklist.items.length }}
        onPress={() => router.push(`/jobs/${id}/checklist`)}
      />
      <ListItem testID="job-open-parts" icon={Package} titleKey="jobs.actions.parts" subtitleKey="jobs.detail.partsCount" subtitleValues={{ count: parts.length }} onPress={() => router.push(`/jobs/${id}/parts`)} />
      {status === "COMPLETED" || status === "VERIFIED" ? (
        <Card testID="job-resolution">
          <Text variant="label" i18nKey="jobs.complete.resolution" />
          <Text>{String(wo.resolution ?? "")}</Text>
        </Card>
      ) : null}
      {localMedia.length > 0 ? (
        <Card>
          <Text variant="label" i18nKey="jobs.detail.evidence" />
          <Thumbnails drafts={localMedia} />
        </Card>
      ) : null}
      {status === "IN_PROGRESS" ? <ListItem testID="job-open-complete" icon={Wrench} titleKey="jobs.actions.complete" subtitleKey="jobs.detail.completeHint" onPress={() => router.push(`/jobs/${id}/complete`)} /> : null}
      {inField ? (
        <ListItem
          testID="job-while-here"
          icon={Megaphone}
          titleKey="jobs.whileHere.action"
          subtitleKey="jobs.whileHere.hint"
          onPress={() => {
            const params = new URLSearchParams();
            if (typeof wo.assetId === "string") params.set("assetId", wo.assetId);
            if (typeof wo.siteId === "string") params.set("siteId", wo.siteId);
            router.push(`/reports/new?${params.toString()}`);
          }}
        />
      ) : null}
      <CommentThread entityType="WORK_ORDER" entityId={id} />

      <BottomSheet testID="job-arrival-sheet" visible={arrival.fix !== undefined} onClose={arrival.close} titleKey="jobs.arrival.title" titleValues={{ name: String(site?.name ?? wo.title ?? "") }}>
        <View style={styles.sheet}>
          <Text i18nKey="jobs.arrival.body" />
          <Button
            testID="job-arrival-confirm"
            icon={MapPinCheck}
            labelKey="jobs.arrival.confirm"
            onPress={() => {
              arrival.close();
              void run("arrive");
            }}
          />
          <Button testID="job-arrival-not-yet" variant="secondary" icon={Timer} labelKey="jobs.arrival.notYet" onPress={arrival.decline} />
          <Button
            testID="job-arrival-wrong-place"
            variant="ghost"
            icon={MapPinX}
            labelKey="jobs.arrival.wrongPlace"
            onPress={() => {
              const fix = arrival.fix;
              arrival.decline();
              if (fix === undefined) return;
              createComment({ id: getSyncRuntime().newId(), entityType: "WORK_ORDER", entityId: id, body: t("jobs.arrival.pointComment", { point: pointUpdateText(fix) }) })
                .then(() => showToast({ messageKey: "jobs.arrival.pointSent", tone: "success" }))
                .catch((error: unknown) => setErrorCode(errorCodeOf(error) as AppErrorCode));
            }}
          />
        </View>
      </BottomSheet>

      <BottomSheet testID={`job-sheet-${sheet ?? "none"}`} visible={sheet !== undefined} onClose={() => setSheet(undefined)} titleKey={sheet === "decline" ? "jobs.decline.title" : "jobs.hold.title"}>
        {sheet === "hold" ? (
          <View style={styles.chips}>
            {HOLD_REASONS.map((value) => (
              <Chip key={value} testID={`job-hold-${value}`} labelKey={`jobs.holdReason.${value}`} selected={holdReason === value} onPress={() => setHoldReason(value)} />
            ))}
          </View>
        ) : null}
        <TextField testID="job-sheet-reason" labelKey={sheet === "decline" ? "jobs.decline.reason" : "jobs.hold.note"} value={reason} onChangeText={setReason} multiline />
        {sheetError === undefined ? null : <InlineError messageKey={sheetError} />}
        <Button testID="job-sheet-submit" labelKey={sheet === "decline" ? "jobs.actions.decline" : "jobs.actions.hold"} variant={sheet === "decline" ? "danger" : "primary"} onPress={() => void submitSheet()} />
      </BottomSheet>
      <ErrorSheet code={errorCode} onClose={() => setErrorCode(undefined)} entityType="WORK_ORDER" entityId={id} handlers={{ retry: () => setErrorCode(undefined) }} />
    </Screen>
  );
}

/** The arrival prompt aims at the job pin, else the site pin (WO-05 order), with the site's radius. */
function arrivalTarget(id: string, wo: Record<string, unknown> | undefined, site: Record<string, unknown> | undefined): ArrivalTarget | undefined {
  if (wo === undefined) return undefined;
  const lat = typeof wo.destLat === "number" ? wo.destLat : typeof site?.lat === "number" ? site.lat : undefined;
  const lng = typeof wo.destLng === "number" ? wo.destLng : typeof site?.lng === "number" ? site.lng : undefined;
  if (lat === undefined || lng === undefined) return undefined;
  return { workOrderId: id, status: String(wo.status ?? ""), lat, lng, radiusM: typeof site?.radiusM === "number" ? site.radiusM : null };
}

const styles = StyleSheet.create({
  sheet: { gap: 12 },
  footer: { gap: 8 },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginVertical: 8 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
});
