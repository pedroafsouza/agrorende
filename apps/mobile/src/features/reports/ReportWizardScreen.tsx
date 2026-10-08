import { getCurrentPositionAsync, requestForegroundPermissionsAsync } from "expo-location";
import { useRouter } from "expo-router";
import { MapPin, Video } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { AssetPicker } from "../../components/AssetPicker";
import { MediaCapture, type MediaDraft } from "../../components/MediaCapture";
import { Wizard, useWizard, type WizardStep } from "../../components/Wizard";
import { useT } from "../../i18n/useT";
import { discardCapture } from "../../media/capture";
import { useServices } from "../../lib/services";
import { useLocalQuery } from "../../lib/useLocalQuery";
import { createReport } from "../../sync/mutators/reports";
import { Banner, Button, Card, Chip, Segmented, StatusPill, Text, TextField } from "../../ui";
import { InlineError } from "../../ui/recovery/InlineError";
import { getAsset } from "../assets/logic";
import "./i18n";
import {
  acceptMediaChange,
  assetAttention,
  buildCreatePayload,
  countVideos,
  isLocationWeak,
  ISSUE_CATEGORIES,
  newReportDraft,
  openCasesForAsset,
  PRIORITIES,
  PRIORITY_TONE,
  REPORT_MEDIA_TAGS,
  REPORT_VIDEO_LIMIT,
  SUGGESTED_ACTIONS,
  validateDetails,
  validateEvidence,
  validateMachine,
  validateReview,
  type ReportDraft,
} from "./logic";

export type ReportWizardScreenProps = {
  /** Prefills the Machine step (asset profile, QR scan). */
  readonly assetId?: string;
  /** Resumes a saved draft (EC-FR-12). */
  readonly draftId?: string;
};

/** F1 report wizard: Machine → Evidence → Details → Review, autosaved after every change (FR-01..FR-07). */
export function ReportWizardScreen({ assetId, draftId }: ReportWizardScreenProps) {
  const router = useRouter();
  const services = useServices();
  const t = useT();
  const [id] = useState(() => draftId ?? services.newId?.() ?? `${Date.now()}`);
  const [initial] = useState(() => newReportDraft(id, assetId));

  const steps: readonly WizardStep<ReportDraft>[] = [
    { id: "machine", titleKey: "reports.wizard.step.machine", render: () => <MachineStep restored={draftId !== undefined} />, validate: validateMachine },
    { id: "evidence", titleKey: "reports.wizard.step.evidence", render: () => <EvidenceStep />, validate: validateEvidence },
    { id: "details", titleKey: "reports.wizard.step.details", render: () => <DetailsStep />, validate: validateDetails },
    { id: "review", titleKey: "reports.wizard.step.review", render: () => <ReviewStep />, validate: validateReview },
  ];

  return (
    <Wizard<ReportDraft>
      testID="report-wizard"
      draftId={id}
      kind="FIELD_REPORT"
      initialPayload={initial}
      steps={steps}
      submitLabelKey="reports.wizard.send"
      onCancel={() => router.back()}
      onSubmit={async (payload) => {
        const body = buildCreatePayload(payload, t(`reports.category.${payload.category ?? "OTHER"}`));
        await createReport(body, { ...(body.lat === undefined ? {} : { lat: body.lat }), ...(body.lng === undefined ? {} : { lng: body.lng }) });
        router.replace(`/reports/${payload.id}`);
      }}
    />
  );
}

function MachineStep({ restored }: { readonly restored: boolean }) {
  const router = useRouter();
  const { payload, update } = useWizard<ReportDraft>();
  const [showRestored, setShowRestored] = useState(restored);
  const [ignoreDuplicates, setIgnoreDuplicates] = useState(false);
  const context = useLocalQuery(
    async (db) => {
      if (payload.assetId === undefined) return { attention: [], cases: [] };
      const asset = await getAsset(db, payload.assetId);
      return { attention: assetAttention(asset), cases: await openCasesForAsset(db, payload.assetId, payload.id) };
    },
    [payload.assetId, payload.id],
  );
  const attention = context.status === "ready" ? context.data.attention : [];
  const cases = context.status === "ready" ? context.data.cases : [];
  const first = cases[0];

  return (
    <View style={styles.stack}>
      {showRestored ? (
        <Banner testID="report-draft-restored" tone="success" titleKey="errors.REPORT_DRAFT_RESTORED.title" bodyKey="errors.REPORT_DRAFT_RESTORED.body" onDismiss={() => setShowRestored(false)} />
      ) : null}
      <AssetPicker
        value={{ ...(payload.assetId === undefined ? {} : { assetId: payload.assetId }), ...(payload.unregisteredAssetDesc === undefined ? {} : { unregisteredAssetDescription: payload.unregisteredAssetDesc }) }}
        initialTab={payload.assetId === undefined ? (payload.unregisteredAssetDesc === undefined ? "scan" : "unregistered") : "recent"}
        onChange={(value) => {
          setIgnoreDuplicates(false);
          update((current) => {
            const { assetId: _a, unregisteredAssetDesc: _u, ...rest } = current;
            return {
              ...rest,
              ...(value.assetId === undefined ? {} : { assetId: value.assetId }),
              ...(value.unregisteredAssetDescription === undefined ? {} : { unregisteredAssetDesc: value.unregisteredAssetDescription }),
            };
          });
        }}
      />
      {attention.length > 0 ? (
        <Banner testID="report-asset-attention" tone="info" titleKey="errors.REPORT_ASSET_ATTENTION.title" bodyKey={`reports.attention.${attention[0] ?? "RETIRED"}`} />
      ) : null}
      {first !== undefined && !ignoreDuplicates ? (
        <Banner
          testID="report-duplicate-hint"
          tone="warning"
          titleKey="errors.REPORT_DUPLICATE_HINT.title"
          bodyKey="errors.REPORT_DUPLICATE_HINT.body"
          action={{ labelKey: "reports.wizard.openExisting", onPress: () => router.push(first.kind === "report" ? `/reports/${first.id}` : `/jobs/${first.id}`) }}
          secondaryAction={{ labelKey: "reports.wizard.continueNew", onPress: () => setIgnoreDuplicates(true) }}
        />
      ) : null}
    </View>
  );
}

function EvidenceStep() {
  const services = useServices();
  const { payload, update } = useWizard<ReportDraft>();
  const [limitHit, setLimitHit] = useState(false);

  const onChange = (next: readonly MediaDraft[]) => {
    const change = acceptMediaChange(payload.media, next);
    setLimitHit(change.error !== undefined);
    for (const rejected of change.rejected) {
      if (services.db !== undefined && services.files !== undefined) discardCapture(services.db, services.files, rejected.id).catch(() => undefined);
    }
    update({ media: change.media });
  };

  return (
    <View style={styles.stack}>
      <Text i18nKey="reports.wizard.evidenceHint" values={{ max: REPORT_VIDEO_LIMIT }} tone="secondary" />
      <MediaCapture parent={{ type: "FIELD_REPORT", id: payload.id }} allowedTags={REPORT_MEDIA_TAGS} value={payload.media} onChange={onChange} allowVideo={countVideos(payload.media) < REPORT_VIDEO_LIMIT} />
      <Text testID="report-video-count" i18nKey="reports.wizard.videoCount" values={{ count: countVideos(payload.media), max: REPORT_VIDEO_LIMIT }} variant="caption" tone="secondary" />
      {limitHit ? (
        <Banner testID="report-video-limit" tone="warning" titleKey="errors.REPORT_VIDEO_LIMIT_EXCEEDED.title" bodyKey="errors.REPORT_VIDEO_LIMIT_EXCEEDED.body" onDismiss={() => setLimitHit(false)} />
      ) : null}
    </View>
  );
}

function DetailsStep() {
  const { payload, update } = useWizard<ReportDraft>();
  return (
    <View style={styles.stack}>
      <Text i18nKey="reports.field.category" variant="label" />
      <View style={styles.chips}>
        {ISSUE_CATEGORIES.map((category) => (
          <Chip key={category} testID={`report-category-${category}`} labelKey={`reports.category.${category}`} selected={payload.category === category} onPress={() => update({ category })} />
        ))}
      </View>
      <Text i18nKey="reports.field.priority" variant="label" />
      <Segmented testID="report-priority" value={payload.priority} onChange={(priority) => update({ priority })} options={PRIORITIES.map((value) => ({ value, labelKey: `reports.priority.${value}`, tone: PRIORITY_TONE[value] }))} />
      <Text i18nKey="reports.field.operable" variant="label" />
      <Segmented
        testID="report-operable"
        large
        value={payload.machineOperable ? "yes" : "no"}
        onChange={(value) => update({ machineOperable: value === "yes" })}
        options={[
          { value: "yes", labelKey: "reports.operable.yes", tone: "success" },
          { value: "no", labelKey: "reports.operable.no", tone: "danger" },
        ]}
      />
      <Text i18nKey="reports.field.suggestedAction" variant="label" />
      <View style={styles.chips}>
        {SUGGESTED_ACTIONS.map((action) => (
          <Chip key={action} testID={`report-action-${action}`} labelKey={`reports.suggestedAction.${action}`} selected={payload.suggestedAction === action} onPress={() => update({ suggestedAction: action })} />
        ))}
      </View>
      <TextField testID="report-title" labelKey="reports.field.title" placeholderKey="reports.field.titlePlaceholder" value={payload.title ?? ""} onChangeText={(title) => update({ title })} maxLength={120} />
      <TextField
        testID="report-description"
        labelKey="reports.field.description"
        placeholderKey="reports.field.descriptionPlaceholder"
        value={payload.description ?? ""}
        onChangeText={(description) => update({ description })}
        multiline
      />
    </View>
  );
}

function ReviewStep() {
  const { payload, update, goTo } = useWizard<ReportDraft>();
  const [locating, setLocating] = useState(false);
  const [locationFailed, setLocationFailed] = useState(false);
  const asset = useLocalQuery(async (db) => (payload.assetId === undefined ? undefined : getAsset(db, payload.assetId)), [payload.assetId]);
  const assetName = asset.status === "ready" && asset.data !== undefined ? String(asset.data.name ?? asset.data.code ?? "") : undefined;
  const evidence = validateEvidence(payload);

  const locate = async () => {
    setLocating(true);
    setLocationFailed(false);
    try {
      const permission = await requestForegroundPermissionsAsync();
      if (permission.status !== "granted") throw new Error("denied");
      const position = await getCurrentPositionAsync({});
      update({ lat: position.coords.latitude, lng: position.coords.longitude, ...(position.coords.accuracy === null ? {} : { accuracyM: Math.round(position.coords.accuracy) }) });
    } catch {
      setLocationFailed(true);
    } finally {
      setLocating(false);
    }
  };

  return (
    <View style={styles.stack}>
      <Card testID="report-review-summary">
        {payload.assetId !== undefined ? (
          <Text i18nKey="reports.wizard.machineSelected" values={{ name: assetName ?? "" }} variant="label" />
        ) : (
          <Text i18nKey="reports.wizard.unregisteredMachine" values={{ description: payload.unregisteredAssetDesc ?? "" }} variant="label" />
        )}
        <Text i18nKey="reports.wizard.mediaCount" values={{ count: payload.media.length }} />
        {payload.category === undefined ? null : <Text i18nKey={`reports.category.${payload.category}`} />}
        <View style={styles.row}>
          <StatusPill labelKey={`reports.priority.${payload.priority}`} tone={PRIORITY_TONE[payload.priority]} />
          <StatusPill labelKey={payload.machineOperable ? "reports.operable.yes" : "reports.operable.no"} tone={payload.machineOperable ? "success" : "danger"} />
          <StatusPill labelKey={`reports.suggestedAction.${payload.suggestedAction}`} tone="neutral" />
        </View>
        {payload.title === undefined || payload.title.length === 0 ? null : <Text selectable>{payload.title}</Text>}
      </Card>
      {evidence === true ? null : (
        <View style={styles.stack}>
          <InlineError testID="report-review-evidence" messageKey={evidence} />
          <Button variant="secondary" icon={Video} labelKey="reports.wizard.step.evidence" onPress={() => goTo("evidence")} />
        </View>
      )}
      {payload.lat !== undefined && payload.accuracyM !== undefined ? <Text i18nKey="reports.wizard.locationReady" values={{ meters: payload.accuracyM }} tone="secondary" /> : null}
      {isLocationWeak(payload) ? (
        <Banner testID="report-location-weak" tone="warning" titleKey="errors.REPORT_LOCATION_WEAK.title" bodyKey={locationFailed ? "reports.wizard.locationFailed" : "errors.REPORT_LOCATION_WEAK.body"} />
      ) : null}
      <Button testID="report-locate" variant="secondary" icon={MapPin} labelKey="reports.wizard.useLocation" loading={locating} onPress={() => void locate()} />
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  stack: { gap: 12 },
});
