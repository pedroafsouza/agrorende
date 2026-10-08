import type { WorkOrderStatus } from "@agrorende/contracts/enums";
import { useRouter } from "expo-router";
import { CheckCircle2, ClipboardList } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { MediaCapture, type MediaDraft } from "../../components/MediaCapture";
import { SignaturePad, type SignatureResult } from "../../components/SignaturePad";
import { useLocale } from "../../i18n/useT";
import { deleteDraft, loadDraft, saveDraft } from "../../lib/drafts";
import { errorCodeOf } from "../../lib/errors";
import { useServices } from "../../lib/services";
import { completeWorkOrder } from "../../sync/mutators/jobs";
import { registerMedia } from "../../sync/mutators/media";
import { Banner, Button, Card, Chip, EmptyState, ErrorState, NumberField, Screen, Skeleton, Text, TextField, showToast } from "../../ui";
import { ErrorSheet } from "../../ui/recovery/ErrorSheet";
import { InlineError } from "../../ui/recovery/InlineError";
import "./i18n";
import { afterPhotoCount, checklistOf, completionBlock, type CompletionBlock, type CompletionDraft } from "./logic";
import { useJob } from "./useJob";

const EVIDENCE_TAGS = ["AFTER", "BEFORE", "GENERAL"] as const;

export function completionDraftId(workOrderId: string): string {
  return `wo-complete-${workOrderId}`;
}

async function register(drafts: readonly MediaDraft[], known: ReadonlySet<string>): Promise<void> {
  for (const draft of drafts) {
    if (known.has(draft.id)) continue;
    const { localUri: _uri, thumbUri: _thumb, ...meta } = draft;
    await registerMedia(meta);
  }
}

/** Completion (WO-10): resolution, after photo, hour meter and signature, each guard pointing at its field. */
export function JobCompleteScreen({ id }: { readonly id: string }) {
  const router = useRouter();
  const locale = useLocale();
  const { db, userId, now } = useServices();
  const query = useJob(id);
  const [draft, setDraft] = useState<CompletionDraft>({ resolution: "" });
  const [block, setBlock] = useState<CompletionBlock | undefined>();
  const [sheetCode, setSheetCode] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const registered = useRef(new Set<string>());
  const restored = useRef(false);

  useEffect(() => {
    if (db === undefined || restored.current) return;
    restored.current = true;
    void loadDraft<CompletionDraft>(db, completionDraftId(id)).then((saved) => {
      if (saved !== undefined) setDraft(saved.payload);
    });
  }, [db, id]);

  const update = (patch: Partial<CompletionDraft>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    setBlock(undefined);
    if (db !== undefined) void saveDraft(db, { id: completionDraftId(id), kind: "WO_COMPLETE", refId: id, step: "form", payload: next, updatedAt: new Date(now?.() ?? Date.now()).toISOString() });
  };

  if (query.status === "loading") return <Screen testID="job-complete-loading"><Skeleton lines={8} /></Screen>;
  if (query.status === "error") return <Screen testID="job-complete-error"><ErrorState onRetry={query.reload} /></Screen>;
  if (query.data === undefined) return <Screen testID="job-complete-missing"><EmptyState icon={ClipboardList} titleKey="jobs.detail.notFoundTitle" bodyKey="jobs.detail.notFoundBody" /></Screen>;

  const { workOrder: wo, asset, media, localMedia, requireWoSignature } = query.data;
  for (const m of media) registered.current.add(String(m.id));
  const status = String(wo.status) as WorkOrderStatus;
  if (status !== "IN_PROGRESS") {
    return (
      <Screen testID="job-complete-unavailable">
        <EmptyState icon={CheckCircle2} titleKey={status === "COMPLETED" || status === "VERIFIED" ? "jobs.complete.alreadyTitle" : "jobs.complete.notReadyTitle"} bodyKey={status === "COMPLETED" || status === "VERIFIED" ? "jobs.complete.alreadyBody" : "jobs.complete.notReadyBody"} action={{ labelKey: "jobs.detail.backToJob", onPress: () => router.replace(`/jobs/${id}`) }} />
      </Screen>
    );
  }
  const { items, responses } = checklistOf(wo);
  const assetHourMeter = typeof asset?.hourMeter === "number" ? asset.hourMeter : null;
  const lastRead = typeof asset?.updatedAt === "string" ? Date.parse(asset.updatedAt) : Number.NaN;
  const hoursSinceReading = Number.isFinite(lastRead) ? Math.max(0, ((now?.() ?? Date.now()) - lastRead) / 3_600_000) : 24;
  const evidence = localMedia.filter((m) => (EVIDENCE_TAGS as readonly string[]).includes(m.tag));

  const submit = async () => {
    const found = completionBlock(draft, {
      status,
      isAssignee: wo.assigneeId === userId,
      afterPhotoCount: afterPhotoCount(media),
      checklistItems: items,
      checklistResponses: responses,
      requireWoSignature,
      assetHourMeter,
      hoursSinceReading,
    });
    if (found !== undefined) {
      setBlock(found);
      if (found.field === "checklist") setSheetCode(found.code);
      return;
    }
    setBusy(true);
    try {
      await completeWorkOrder({
        id,
        resolution: draft.resolution.trim(),
        documentLocale: locale === "en" ? "en" : "pt-BR",
        ...(draft.rootCause === undefined || draft.rootCause.trim() === "" ? {} : { rootCause: draft.rootCause.trim() }),
        ...(draft.hourMeterReading === undefined ? {} : { hourMeterReading: draft.hourMeterReading }),
        ...(draft.meterReplaced === true ? { meterReplaced: true, ...(draft.meterPhotoMediaId === undefined ? {} : { meterPhotoMediaId: draft.meterPhotoMediaId }) } : {}),
        ...(draft.signatureStatus === undefined ? {} : { signatureStatus: draft.signatureStatus }),
        ...(draft.customerSignerName === undefined ? {} : { customerSignerName: draft.customerSignerName }),
        ...(draft.signatureReason === undefined ? {} : { signatureReason: draft.signatureReason }),
        ...(draft.signatureWitnessName === undefined ? {} : { signatureWitnessName: draft.signatureWitnessName }),
        ...(draft.signatureMediaId === undefined ? {} : { signatureMediaId: draft.signatureMediaId }),
      });
      if (db !== undefined) await deleteDraft(db, completionDraftId(id));
      showToast({ messageKey: "jobs.toast.complete", tone: "success" });
      router.replace(`/jobs/${id}`);
    } catch (err) {
      setSheetCode(errorCodeOf(err));
    } finally {
      setBusy(false);
    }
  };

  const onSigned = async (result: SignatureResult) => {
    if (result.media !== undefined) {
      await register([result.media], registered.current);
      registered.current.add(result.media.id);
    }
    update({
      signatureStatus: result.status,
      ...(result.signerName === undefined ? {} : { customerSignerName: result.signerName }),
      ...(result.reason === undefined ? {} : { signatureReason: result.reason }),
      ...(result.mediaId === undefined ? {} : { signatureMediaId: result.mediaId }),
    });
  };

  const fieldError = (field: CompletionBlock["field"]) => (block?.field === field ? <InlineError testID={`job-complete-error-${field}`} code={block.code} /> : null);

  return (
    <Screen testID="job-complete" footer={<Button testID="job-complete-submit" labelKey="jobs.actions.complete" icon={CheckCircle2} loading={busy} haptic onPress={() => void submit()} />}>
      {block === undefined ? null : <Banner testID={`job-complete-block-${block.code}`} tone="warning" titleKey={`errors.${block.code}.title`} bodyKey={`errors.${block.code}.body`} />}
      <Card>
        <TextField testID="job-complete-resolution" labelKey="jobs.complete.resolution" hintKey="jobs.complete.resolutionHint" value={draft.resolution} onChangeText={(resolution) => update({ resolution })} multiline />
        {fieldError("resolution")}
        <TextField testID="job-complete-root-cause" labelKey="jobs.complete.rootCause" value={draft.rootCause ?? ""} onChangeText={(rootCause) => update({ rootCause })} />
      </Card>
      <Card>
        <Text variant="label" i18nKey="jobs.complete.photos" />
        <Text variant="caption" tone="secondary" i18nKey="jobs.complete.photosHint" />
        <MediaCapture
          parent={{ type: "WORK_ORDER", id }}
          allowedTags={EVIDENCE_TAGS}
          value={evidence}
          onChange={(drafts) => {
            void register(drafts, registered.current).then(() => {
              for (const d of drafts) registered.current.add(d.id);
              setBlock(undefined);
            });
          }}
        />
        {fieldError("afterPhoto")}
      </Card>
      {asset === undefined ? null : (
        <Card>
          <NumberField
            testID="job-complete-hour-meter"
            labelKey="jobs.complete.hourMeter"
            unitKey="jobs.complete.hoursUnit"
            min={0}
            step={1}
            value={draft.hourMeterReading}
            onChange={(hourMeterReading) => update({ hourMeterReading, jumpConfirmed: false })}
          />
          {assetHourMeter === null ? null : <Text variant="caption" tone="secondary" i18nKey="jobs.complete.lastReading" values={{ hours: assetHourMeter }} />}
          <View style={styles.row}>
            <Chip testID="job-complete-meter-replaced" labelKey="jobs.complete.meterReplaced" selected={draft.meterReplaced === true} onPress={() => update({ meterReplaced: draft.meterReplaced !== true })} />
          </View>
          {draft.meterReplaced === true ? (
            <MediaCapture
              parent={{ type: "WORK_ORDER", id }}
              allowedTags={["HOUR_METER"]}
              onChange={(drafts) => {
                const last = drafts[drafts.length - 1];
                void register(drafts, registered.current).then(() => update(last === undefined ? {} : { meterPhotoMediaId: last.id }));
              }}
            />
          ) : null}
          {fieldError("hourMeter")}
          {block?.code === "METER_READING_JUMP" ? <Button testID="job-complete-confirm-jump" variant="secondary" labelKey="jobs.complete.confirmJump" onPress={() => update({ jumpConfirmed: true })} /> : null}
        </Card>
      )}
      <Card>
        <Text variant="label" i18nKey={requireWoSignature ? "jobs.complete.signatureRequired" : "jobs.complete.signatureOptional"} />
        {draft.signatureStatus === undefined ? (
          <SignaturePad documentLocale={locale === "en" ? "en" : "pt-BR"} parent={{ type: "WORK_ORDER", id }} tag="SIGNATURE_CUSTOMER" onSigned={(result) => void onSigned(result)} />
        ) : (
          <View style={styles.row}>
            <Text testID="job-complete-signature-status" i18nKey={`jobs.complete.signatureStatus.${draft.signatureStatus}`} />
            <Button compact variant="ghost" labelKey="jobs.complete.signAgain" onPress={() => update({ signatureStatus: undefined, signatureMediaId: undefined })} />
          </View>
        )}
        {fieldError("signature")}
      </Card>
      <ErrorSheet code={sheetCode as never} onClose={() => setSheetCode(undefined)} entityType="WORK_ORDER" entityId={id} handlers={{ fix: () => router.push(`/jobs/${id}/checklist`), retry: () => setSheetCode(undefined) }} />
    </Screen>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" } });
