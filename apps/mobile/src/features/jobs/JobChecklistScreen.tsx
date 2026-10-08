import type { ChecklistItem, ChecklistResponse } from "@agrorende/contracts/checklist";
import type { WorkOrderStatus } from "@agrorende/contracts/enums";
import { useRouter } from "expo-router";
import { ClipboardList } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";

import { ChecklistRunner } from "../../components/ChecklistRunner";
import { checklistProgress } from "../../components/ChecklistRunner/logic";
import { MediaCapture, type MediaDraft } from "../../components/MediaCapture";
import { errorCodeOf } from "../../lib/errors";
import { useServices } from "../../lib/services";
import { registerMedia } from "../../sync/mutators/media";
import { saveChecklist } from "../../sync/mutators/jobs";
import { BottomSheet, Button, ConfirmDialog, EmptyState, ErrorState, Screen, Skeleton, Text } from "../../ui";
import { InlineError } from "../../ui/recovery/InlineError";
import "./i18n";
import { checklistOf } from "./logic";
import { useJob } from "./useJob";

const EDITABLE: readonly WorkOrderStatus[] = ["ON_SITE", "IN_PROGRESS", "ON_HOLD"];

/** Checklist run (WO-06, WO-07, WO-08): answers save as they are given; a safety-critical FAIL stops the job. */
export function JobChecklistScreen({ id }: { readonly id: string }) {
  const router = useRouter();
  const { now } = useServices();
  const query = useJob(id);
  const [responses, setResponses] = useState<readonly ChecklistResponse[] | undefined>();
  const [photoFor, setPhotoFor] = useState<ChecklistItem | undefined>();
  const [stopped, setStopped] = useState<ChecklistItem | undefined>();
  const [error, setError] = useState<string | undefined>();
  const loadedFor = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (query.status === "ready" && query.data !== undefined && loadedFor.current !== id) {
      loadedFor.current = id;
      setResponses(checklistOf(query.data.workOrder).responses);
    }
  }, [query.status, query.data, id]);

  if (query.status === "loading") return <Screen testID="job-checklist-loading"><Skeleton lines={8} /></Screen>;
  if (query.status === "error") return <Screen testID="job-checklist-error"><ErrorState onRetry={query.reload} /></Screen>;
  if (query.data === undefined) return <Screen testID="job-checklist-missing"><EmptyState icon={ClipboardList} titleKey="jobs.detail.notFoundTitle" bodyKey="jobs.detail.notFoundBody" /></Screen>;

  const wo = query.data.workOrder;
  const { items, version } = checklistOf(wo);
  const current = responses ?? checklistOf(wo).responses;
  const status = String(wo.status) as WorkOrderStatus;
  const readOnly = !EDITABLE.includes(status);
  if (items.length === 0) return <Screen testID="job-checklist-empty"><EmptyState icon={ClipboardList} titleKey="jobs.checklist.emptyTitle" bodyKey="jobs.checklist.emptyBody" /></Screen>;
  const progress = checklistProgress(items, current);

  const persist = async (next: readonly ChecklistResponse[]) => {
    setResponses(next);
    setError(undefined);
    try {
      await saveChecklist({ id, templateVersion: version, responses: [...next] });
    } catch (err) {
      setError(errorCodeOf(err));
    }
  };

  const onPhotos = async (drafts: readonly MediaDraft[]) => {
    if (photoFor === undefined) return;
    const known = new Set(query.data?.localMedia.map((m) => m.id));
    const added = drafts.filter((d) => !known.has(d.id));
    for (const draft of added) {
      const { localUri: _uri, thumbUri: _thumb, ...meta } = draft;
      await registerMedia({ ...meta, checklistItemKey: photoFor.key });
    }
    const existing = current.find((r) => r.key === photoFor.key);
    const at = new Date(now?.() ?? Date.now()).toISOString();
    const response: ChecklistResponse = { key: photoFor.key, value: existing?.value ?? null, ...(existing?.note === undefined ? {} : { note: existing.note }), mediaIds: [...new Set([...(existing?.mediaIds ?? []), ...added.map((d) => d.id)])], answeredAt: at };
    await persist([...current.filter((r) => r.key !== photoFor.key), response]);
  };

  return (
    <Screen testID="job-checklist" footer={<Button testID="job-checklist-done" labelKey="jobs.checklist.done" onPress={() => router.back()} />}>
      <Text testID="job-checklist-progress" i18nKey="jobs.checklist.progress" values={{ done: progress.answered, total: progress.total }} variant="label" />
      {error === undefined ? null : <InlineError code={error} />}
      <ChecklistRunner
        items={items}
        responses={current}
        readOnly={readOnly}
        onChange={(next) => void persist(next)}
        onSafetyStop={(item) => setStopped(item)}
        onCapturePhoto={(item) => setPhotoFor(item)}
        {...(now === undefined ? {} : { now })}
      />
      <BottomSheet testID="job-checklist-photo" visible={photoFor !== undefined} onClose={() => setPhotoFor(undefined)} titleKey="jobs.checklist.photoTitle">
        {photoFor === undefined ? null : <MediaCapture parent={{ type: "WORK_ORDER", id }} allowedTags={["CHECKLIST_ITEM"]} checklistItemKey={photoFor.key} onChange={(drafts) => void onPhotos(drafts)} />}
      </BottomSheet>
      <ConfirmDialog
        visible={stopped !== undefined}
        titleKey="errors.WO_SAFETY_STOP_REQUIRED.title"
        bodyKey="jobs.checklist.safetyStopBody"
        confirmLabelKey="jobs.checklist.safetyStopConfirm"
        onConfirm={() => {
          setStopped(undefined);
          router.replace(`/jobs/${id}`);
        }}
        onCancel={() => setStopped(undefined)}
      />
    </Screen>
  );
}
