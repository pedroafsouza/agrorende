import type { Priority } from "@agrorende/contracts/enums";
import { Stack, useRouter } from "expo-router";
import { ClipboardList, FileQuestion, Pencil, Save, Undo2 } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { MapPreview } from "../../components/MapPreview";
import { MediaCapture, Thumbnails, type MediaDraft } from "../../components/MediaCapture";
import { useT } from "../../i18n/useT";
import { errorCodeOf } from "../../lib/errors";
import { useServices } from "../../lib/services";
import { useLocalQuery } from "../../lib/useLocalQuery";
import { localMediaUri } from "../../media/capture";
import { registerMedia } from "../../sync/mutators/media";
import { updateReport, withdrawReport } from "../../sync/mutators/reports";
import { Banner, BottomSheet, Button, Card, EmptyState, ErrorState, ListItem, Screen, Segmented, Skeleton, StatusPill, Text, TextField } from "../../ui";
import { InlineError } from "../../ui/recovery/InlineError";
import { CommentThread } from "../comments";
import { formatRelative } from "../sync/format";
import "./i18n";
import { canEdit, canWithdraw, getReportDetail, PRIORITIES, PRIORITY_TONE, rejectedReportEdit, REPORT_MEDIA_TAGS, reportFlags, STATUS_TONE } from "./logic";

/** Report detail: status, evidence, location and the linked work order (FR-08, EC-FR-14, EC-FR-17). */
export function ReportDetailScreen({ id }: { readonly id: string }) {
  const router = useRouter();
  const t = useT();
  const { userId } = useServices();
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [withdrawError, setWithdrawError] = useState<string | undefined>();
  const query = useLocalQuery(async (db) => {
    const detail = await getReportDetail(db, id);
    if (detail === undefined) return undefined;
    const media: MediaDraft[] = [];
    for (const row of detail.media) {
      const uri = await localMediaUri(db, String(row.id), "thumb");
      if (uri === undefined) continue;
      media.push({
        id: String(row.id),
        kind: String(row.kind),
        tag: String(row.tag ?? "GENERAL"),
        mimeType: String(row.mimeType ?? ""),
        capturedAt: String(row.capturedAt ?? ""),
        parent: { type: "FIELD_REPORT", id },
        localUri: uri,
      });
    }
    return { ...detail, localMedia: media, editRejected: await rejectedReportEdit(db, id) };
  }, [id]);

  if (query.status === "loading") return <Screen testID="report-detail-loading"><Skeleton lines={8} /></Screen>;
  if (query.status === "error") return <Screen testID="report-detail-error"><ErrorState onRetry={query.reload} /></Screen>;
  if (query.data === undefined) {
    return (
      <Screen testID="report-detail-empty">
        <EmptyState icon={FileQuestion} titleKey="reports.detail.notFoundTitle" bodyKey="reports.detail.notFoundBody" action={{ labelKey: "routes.tabs.reports", onPress: () => router.replace("/reports") }} />
      </Screen>
    );
  }

  const { report, asset, workOrder, localMedia, editRejected } = query.data;
  const status = String(report.status ?? "SUBMITTED") as keyof typeof STATUS_TONE;
  const priority = String(report.priority ?? "MEDIUM") as keyof typeof PRIORITY_TONE;
  const flags = reportFlags(report);
  const number = typeof report.number === "string" ? report.number : undefined;
  const lat = typeof report.lat === "number" ? report.lat : undefined;
  const lng = typeof report.lng === "number" ? report.lng : undefined;
  const title = String(report.title ?? "");
  const withdrawable = canWithdraw(report, userId);
  const editable = canEdit(report, userId);

  const submitWithdraw = async () => {
    setWithdrawError(undefined);
    try {
      await withdrawReport({ id, reason: reason.trim() });
      setWithdrawOpen(false);
      setReason("");
    } catch (error) {
      setWithdrawError(errorCodeOf(error));
    }
  };

  return (
    <Screen
      testID="report-detail"
      footer={
        workOrder !== undefined ? (
          <Button testID="report-open-wo" icon={ClipboardList} labelKey="reports.detail.openWorkOrder" onPress={() => router.push(`/jobs/${String(workOrder.id)}`)} />
        ) : withdrawable ? (
          <Button testID="report-withdraw" variant="secondary" icon={Undo2} labelKey="reports.detail.withdraw" onPress={() => setWithdrawOpen(true)} />
        ) : undefined
      }
    >
      <Stack.Screen options={{ title: number === undefined ? t("routes.reports.detail") : t("reports.detail.number", { number }) }} />
      {status === "MARKED_FOR_REPAIR" ? (
        <Banner testID="report-marked" tone="success" titleKey="errors.REPORT_MARKED_FOR_REPAIR_STATUS.title" bodyKey="errors.REPORT_MARKED_FOR_REPAIR_STATUS.body" />
      ) : null}
      {flags.duplicateOf !== undefined ? <Banner testID="report-merged" tone="info" titleKey="errors.REPORT_DUPLICATE_MERGED.title" bodyKey="errors.REPORT_DUPLICATE_MERGED.body" /> : null}
      {flags.busyAsset === true ? <Banner testID="report-busy" tone="info" titleKey="errors.REPORT_ASSET_BUSY.title" bodyKey="errors.REPORT_ASSET_BUSY.body" /> : null}
      {editRejected === undefined ? null : <Banner testID="report-edit-locked" tone="warning" titleKey="reports.detail.lockedTitle" bodyKey="reports.detail.lockedBody" />}
      {flags.withdrawn === true ? <Banner testID="report-withdrawn" tone="info" titleKey="reports.detail.withdrawn" /> : null}
      <Card>
        <Text variant="title" selectable>
          {title}
        </Text>
        <View style={styles.row}>
          <StatusPill testID="report-status" labelKey={`reports.status.${status}`} tone={STATUS_TONE[status] ?? "neutral"} />
          <StatusPill labelKey={`reports.priority.${priority}`} tone={PRIORITY_TONE[priority] ?? "neutral"} />
          <StatusPill labelKey={report.machineOperable === false ? "reports.operable.no" : "reports.operable.yes"} tone={report.machineOperable === false ? "danger" : "success"} />
        </View>
        {typeof report.category === "string" ? <Text i18nKey={`reports.category.${report.category}`} tone="secondary" /> : null}
        {editable ? <Button testID="report-edit" variant="secondary" icon={Pencil} labelKey="reports.detail.edit" onPress={() => setEditOpen(true)} /> : null}
        {typeof report.occurredAt === "string" ? <Text i18nKey="reports.detail.reported" values={{ when: formatRelative(report.occurredAt, Date.now()) }} tone="secondary" variant="caption" /> : null}
      </Card>
      <Text i18nKey="reports.detail.machine" variant="heading" />
      {asset !== undefined ? (
        <ListItem title={String(asset.name ?? "")} subtitle={String(asset.code ?? "")} onPress={() => router.push(`/assets/${String(asset.id)}`)} />
      ) : (
        <Text i18nKey="reports.detail.unregistered" values={{ description: String(report.unregisteredAssetDesc ?? "") }} selectable />
      )}
      {workOrder !== undefined ? <ListItem icon={ClipboardList} titleKey="reports.detail.workOrder" titleValues={{ number: String(workOrder.number ?? "") }} right={<StatusPill labelKey={`assets.status.${String(workOrder.status)}`} tone="info" />} onPress={() => router.push(`/jobs/${String(workOrder.id)}`)} /> : null}
      {typeof report.description === "string" && report.description.length > 0 ? (
        <>
          <Text i18nKey="reports.detail.description" variant="heading" />
          <Text selectable>{report.description}</Text>
        </>
      ) : null}
      <Text i18nKey="reports.detail.evidence" variant="heading" />
      {localMedia.length === 0 ? <Text i18nKey="reports.detail.noEvidence" tone="secondary" /> : <Thumbnails drafts={localMedia} />}
      {lat !== undefined && lng !== undefined ? <MapPreview destination={{ lat, lng, label: title }} markers={[{ id, lat, lng, label: title }]} /> : null}
      <CommentThread entityType="FIELD_REPORT" entityId={id} />
      {editOpen ? (
        <EditReportSheet
          id={id}
          initial={{ title, description: typeof report.description === "string" ? report.description : "", priority }}
          onClose={() => setEditOpen(false)}
        />
      ) : null}
      <BottomSheet testID="report-withdraw-sheet" visible={withdrawOpen} onClose={() => setWithdrawOpen(false)} titleKey="reports.detail.withdrawTitle">
        <View style={styles.sheet}>
          <Text i18nKey="reports.detail.withdrawBody" />
          <TextField testID="report-withdraw-reason" labelKey="reports.detail.withdrawReason" placeholderKey="reports.detail.withdrawReasonPlaceholder" value={reason} onChangeText={setReason} />
          {withdrawError === undefined ? null : <InlineError code={withdrawError} />}
          <Button testID="report-withdraw-confirm" variant="danger" icon={Undo2} labelKey="reports.detail.withdraw" disabled={reason.trim().length === 0} onPress={() => void submitWithdraw()} />
        </View>
      </BottomSheet>
    </Screen>
  );
}

type EditValues = { readonly title: string; readonly description: string; readonly priority: Priority };

/** FR-11: edit title, description and urgency, and add photos, while the report is still SUBMITTED. */
function EditReportSheet({ id, initial, onClose }: { readonly id: string; readonly initial: EditValues; readonly onClose: () => void }) {
  const [values, setValues] = useState<EditValues>(initial);
  const [added, setAdded] = useState<readonly MediaDraft[]>([]);
  const [error, setError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setError(undefined);
    setSaving(true);
    try {
      const patch = {
        ...(values.title.trim() !== initial.title && values.title.trim().length > 0 ? { title: values.title.trim() } : {}),
        ...(values.description.trim() !== initial.description ? { description: values.description.trim() } : {}),
        ...(values.priority !== initial.priority ? { priority: values.priority } : {}),
      };
      if (Object.keys(patch).length > 0) await updateReport({ id, patch });
      for (const { localUri: _localUri, thumbUri: _thumbUri, ...meta } of added) await registerMedia({ ...meta, parent: { type: "FIELD_REPORT", id } });
      onClose();
    } catch (e) {
      setError(errorCodeOf(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet testID="report-edit-sheet" visible onClose={onClose} titleKey="reports.detail.editTitle">
      <View style={styles.sheet}>
        <TextField testID="report-edit-title" labelKey="reports.field.title" value={values.title} onChangeText={(title) => setValues((v) => ({ ...v, title }))} maxLength={120} />
        <TextField testID="report-edit-description" labelKey="reports.field.description" value={values.description} onChangeText={(description) => setValues((v) => ({ ...v, description }))} multiline />
        <Text i18nKey="reports.field.priority" variant="label" />
        <Segmented testID="report-edit-priority" value={values.priority} onChange={(priority) => setValues((v) => ({ ...v, priority }))} options={PRIORITIES.map((value) => ({ value, labelKey: `reports.priority.${value}`, tone: PRIORITY_TONE[value] }))} />
        <Text i18nKey="reports.detail.addPhoto" variant="label" />
        <MediaCapture parent={{ type: "FIELD_REPORT", id }} allowedTags={REPORT_MEDIA_TAGS} value={added} onChange={setAdded} allowVoice={false} />
        {error === undefined ? null : <InlineError code={error} />}
        <Button testID="report-edit-save" icon={Save} labelKey="reports.detail.saveEdit" loading={saving} onPress={() => void save()} />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, sheet: { gap: 12 } });
