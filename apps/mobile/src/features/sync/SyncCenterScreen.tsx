import { FileWarning, ImageUp, RefreshCw, Send, Trash2 } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet } from "react-native";

import { useServices } from "../../lib/services";
import { bumpLocalData, useLocalQuery } from "../../lib/useLocalQuery";
import { discardMediaFile, retryMediaFile } from "../../media/queue";
import { acknowledgeConflict } from "../../sync/conflicts";
import { discardRejected } from "../../sync/outbox";
import { Banner, Button, Card, ConfirmDialog, ErrorState, IconButton, ListItem, Lottie, Screen, Skeleton, StatusPill, SyncBadge, Text, showToast, useSyncSnapshot } from "../../ui";
import { AskOfficeButton } from "../../ui/recovery";
import { recoveryConfig } from "../../ui/recovery/config";
import { loadSyncCenter, mutationLabelKey } from "./data";
import { formatBytes, formatRelative } from "./format";
import { SyncAttentionBanners } from "./SyncAttention";

/** Sync Center (OFF-05/06): last sync, queued work, uploads, conflicts, Sync now and diagnostics. */
export function SyncCenterScreen() {
  const services = useServices();
  const snapshot = useSyncSnapshot();
  const query = useLocalQuery(loadSyncCenter);
  const [syncing, setSyncing] = useState(false);
  const [sending, setSending] = useState(false);
  const [discardId, setDiscardId] = useState<{ kind: "mutation" | "media"; id: string } | undefined>(undefined);

  async function syncNow(): Promise<void> {
    setSyncing(true);
    try {
      await services.syncNow?.();
    } finally {
      setSyncing(false);
      query.reload();
    }
  }

  async function sendDiagnostics(): Promise<void> {
    const send = recoveryConfig.getState().sendDiagnostics;
    if (send === undefined) return;
    setSending(true);
    try {
      await send({ code: "DIAGNOSTICS_UNAVAILABLE", screen: "sync-center" });
      showToast({ messageKey: "sync.diagnostics.sent", tone: "success" });
    } catch (_error) {
      showToast({ messageKey: "errors.DIAGNOSTICS_SEND_FAILED.title", tone: "danger" });
    } finally {
      setSending(false);
      query.reload();
    }
  }

  async function confirmDiscard(): Promise<void> {
    const target = discardId;
    setDiscardId(undefined);
    if (target === undefined || services.db === undefined) return;
    if (target.kind === "mutation") await discardRejected(services.db, target.id);
    else if (services.files !== undefined) await discardMediaFile(services.db, services.files, target.id);
    bumpLocalData();
  }

  const footer = <Button testID="sync-now" labelKey="sync.action.syncNow" icon={RefreshCw} loading={syncing || snapshot.phase !== "idle"} onPress={() => void syncNow()} />;
  const offline = snapshot.network === "offline";
  const allSent = query.status === "ready" && query.data.outbox.length === 0 && query.data.uploads.length === 0 && query.data.conflicts.length === 0 && snapshot.pendingBytes === 0;

  return (
    <Screen footer={footer} refreshing={false} onRefresh={query.reload} testID="sync-center">
      <Card testID={allSent ? "sync-header-done" : "sync-header-pending"}>
        {query.status === "ready" ? (
          <>
            <Lottie key={allSent ? "done" : "pending"} id={allSent ? "success" : "saved-on-phone"} playOnce={allSent} size={140} testID="sync-header-animation" />
            <Text i18nKey={allSent ? "sync.header.doneTitle" : "sync.header.pendingTitle"} variant="title" accessibilityRole="header" style={styles.center} />
            <Text i18nKey={allSent ? "sync.header.doneBody" : "sync.header.pendingBody"} tone="secondary" style={styles.center} />
          </>
        ) : null}
        <SyncBadge />
        {snapshot.lastSyncAt === undefined ? (
          <Text i18nKey="sync.lastSync.never" tone="secondary" />
        ) : (
          <Text testID="sync-last" i18nKey="sync.lastSync.at" values={{ when: formatRelative(snapshot.lastSyncAt, Date.now()) }} tone="secondary" />
        )}
        {snapshot.pendingBytes > 0 ? <Text i18nKey="sync.pending.bytes" values={{ size: formatBytes(snapshot.pendingBytes) }} tone="secondary" /> : null}
      </Card>
      {offline ? <Banner tone="offline" titleKey="sync.offline.title" bodyKey="sync.offline.body" /> : null}
      {snapshot.clockSkewed ? <Banner tone="warning" titleKey="errors.CLOCK_SKEW.title" bodyKey="errors.CLOCK_SKEW.body" /> : null}
      {snapshot.lastError !== undefined && !offline ? <Banner tone="error" titleKey={`errors.${snapshot.lastError}.title`} bodyKey={`errors.${snapshot.lastError}.body`} /> : null}
      <SyncAttentionBanners exclude={new Set(snapshot.lastError === undefined || offline ? [] : [snapshot.lastError])} />

      {query.status === "loading" ? <Skeleton lines={4} /> : null}
      {query.status === "error" ? <ErrorState onRetry={query.reload} /> : null}
      {query.status === "ready" ? (
        <>
          {query.data.conflicts.length > 0 ? <Text i18nKey="sync.section.conflicts" variant="heading" /> : null}
          {query.data.conflicts.map((conflict) => (
            <Card key={conflict.id} testID={`sync-conflict-${conflict.id}`}>
              <ListItem icon={FileWarning} titleKey={`errors.${conflict.code}.title`} subtitleKey={`errors.${conflict.code}.body`} danger />
              <Text i18nKey={mutationLabelKey(conflict.name)} tone="secondary" variant="caption" />
              {conflict.acknowledgedAt === null ? (
                <Button
                  testID={`sync-conflict-ack-${conflict.id}`}
                  labelKey="sync.action.understood"
                  variant="secondary"
                  compact
                  onPress={() => {
                    if (services.db === undefined) return;
                    void acknowledgeConflict(services.db, conflict.id, new Date().toISOString()).then(bumpLocalData);
                  }}
                />
              ) : null}
              <AskOfficeButton code={conflict.code} reference={conflict.entityId} />
            </Card>
          ))}
          {query.data.outbox.length > 0 ? <Text i18nKey="sync.section.outbox" values={{ count: query.data.outbox.length }} variant="heading" /> : null}
          {query.data.outbox.map((row) => (
            <ListItem
              key={row.id}
              testID={`sync-outbox-${row.id}`}
              icon={Send}
              titleKey={mutationLabelKey(row.name)}
              subtitle={formatRelative(row.occurredAt, Date.now())}
              danger={row.status === "REJECTED"}
              right={
                row.status === "REJECTED" ? (
                  <IconButton icon={Trash2} labelKey="sync.action.discard" tone="danger" testID={`sync-discard-${row.id}`} onPress={() => setDiscardId({ kind: "mutation", id: row.id })} />
                ) : (
                  <StatusPill labelKey={`sync.status.${row.status}`} tone={row.status === "IN_FLIGHT" ? "info" : "neutral"} />
                )
              }
            />
          ))}
          {query.data.uploads.length > 0 ? <Text i18nKey="sync.section.uploads" values={{ count: query.data.uploads.length }} variant="heading" /> : null}
          {query.data.uploads.map((file) => (
            <ListItem
              key={file.mediaId}
              testID={`sync-upload-${file.mediaId}`}
              icon={ImageUp}
              titleKey={`sync.upload.kind.${file.kind}`}
              subtitle={file.sizeBytes === null ? undefined : `${formatBytes(file.bytesSent)} / ${formatBytes(file.sizeBytes)}`}
              danger={file.state === "FAILED"}
              right={
                file.state === "FAILED" ? (
                  <>
                    <IconButton icon={RefreshCw} labelKey="ui.action.retry" testID={`sync-upload-retry-${file.mediaId}`} onPress={() => {
                      if (services.db === undefined) return;
                      void retryMediaFile(services.db, file.mediaId).then(() => {
                        bumpLocalData();
                        services.kick?.();
                      });
                    }} />
                    <IconButton icon={Trash2} labelKey="sync.action.discard" tone="danger" testID={`sync-upload-discard-${file.mediaId}`} onPress={() => setDiscardId({ kind: "media", id: file.mediaId })} />
                  </>
                ) : file.wifiOnly ? (
                  <StatusPill labelKey="sync.upload.waitingWifi" tone="info" />
                ) : (
                  <StatusPill labelKey={`sync.upload.state.${file.state}`} tone="neutral" />
                )
              }
            />
          ))}
          <Card>
            <Text i18nKey="sync.diagnostics.title" variant="label" />
            <Text i18nKey="sync.diagnostics.body" values={{ count: query.data.diagnostics }} tone="secondary" />
            <Button testID="sync-send-diagnostics" labelKey="sync.diagnostics.send" variant="secondary" loading={sending} onPress={() => void sendDiagnostics()} />
          </Card>
        </>
      ) : null}
      <ConfirmDialog
        visible={discardId !== undefined}
        titleKey="sync.discard.title"
        bodyKey="sync.discard.body"
        confirmLabelKey="sync.action.discard"
        destructive
        onConfirm={() => void confirmDiscard()}
        onCancel={() => setDiscardId(undefined)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({ center: { textAlign: "center" } });
