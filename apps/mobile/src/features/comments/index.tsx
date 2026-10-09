import type { EntityType } from "@agrorende/contracts/enums";
import { Clock, MessageSquare, Send } from "lucide-react-native";
import { useState, type ReactElement } from "react";
import { StyleSheet, View } from "react-native";

import { errorCodeOf } from "../../lib/errors";
import { useServices } from "../../lib/services";
import { bumpLocalData, useLocalQuery } from "../../lib/useLocalQuery";
import { getSyncRuntime } from "../../sync/runtime";
import { createComment } from "../../sync/mutators/comments";
import { Banner, Button, Card, Icon, Skeleton, Text, TextField, useSyncSnapshot, useTheme } from "../../ui";
import { InlineError } from "../../ui/recovery/InlineError";
import { formatRelative } from "../sync/format";
import "./i18n";
import { commentDraftError, listLocalComments } from "./logic";

export { COMMENT_MAX_LENGTH, commentDraftError, listLocalComments, type LocalComment } from "./logic";

export interface CommentThreadProps {
  readonly entityType: Extract<EntityType, "FIELD_REPORT" | "WORK_ORDER" | "RENTAL">;
  readonly entityId: string;
}

/**
 * Offline comment thread on the report, job and rental detail screens (PLT-10). Reads the local
 * `comments` mirror; a new comment is written through `comment.create` and waits in the outbox
 * when there is no signal.
 */
export function CommentThread({ entityType, entityId }: CommentThreadProps): ReactElement {
  const theme = useTheme();
  const { userId } = useServices();
  const snapshot = useSyncSnapshot();
  const [draft, setDraft] = useState("");
  const [errorKey, setErrorKey] = useState<string | undefined>();
  const [saveError, setSaveError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const query = useLocalQuery((db) => listLocalComments(db, entityType, entityId), [entityType, entityId]);

  const send = async () => {
    const invalid = commentDraftError(draft);
    setErrorKey(invalid);
    setSaveError(undefined);
    if (invalid !== undefined) return;
    setBusy(true);
    try {
      await createComment({ id: getSyncRuntime().newId(), entityType, entityId, body: draft.trim() });
      setDraft("");
      bumpLocalData();
    } catch (error) {
      setSaveError(errorCodeOf(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <View style={styles.header}>
        <Icon icon={MessageSquare} />
        <Text i18nKey="comments.title" variant="heading" />
      </View>
      {query.status === "loading" ? <Skeleton lines={2} /> : null}
      {query.status === "error" ? <Banner testID="comments-error" tone="error" titleKey="comments.loadError" action={{ labelKey: "ui.action.retry", onPress: query.reload }} /> : null}
      {query.status === "ready" && query.data.length === 0 ? <Text testID="comments-empty" i18nKey="comments.empty" tone="secondary" /> : null}
      {query.status === "ready"
        ? query.data.map((comment) => (
            <View key={comment.id} testID={`comment-${comment.id}`} style={[styles.item, { borderColor: theme.border }]}>
              <View style={styles.meta}>
                {comment.authorId === userId ? (
                  <Text i18nKey="comments.you" variant="label" />
                ) : comment.authorName === null ? (
                  <Text i18nKey="comments.teammate" variant="label" />
                ) : (
                  <Text variant="label">{comment.authorName}</Text>
                )}
                {comment.createdAt.length > 0 ? <Text tone="secondary" variant="caption">{formatRelative(comment.createdAt, Date.now())}</Text> : null}
              </View>
              <Text selectable>{comment.body}</Text>
              {comment.pending ? (
                <View style={styles.meta} testID={`comment-pending-${comment.id}`}>
                  <Icon icon={Clock} size={16} />
                  <Text i18nKey="comments.pending" tone="secondary" variant="caption" />
                </View>
              ) : null}
            </View>
          ))
        : null}
      {snapshot.network === "offline" ? <Text testID="comments-offline" i18nKey="comments.offlineHint" tone="secondary" variant="caption" /> : null}
      <TextField
        testID="comment-input"
        labelKey="comments.label"
        placeholderKey="comments.placeholder"
        errorKey={errorKey}
        value={draft}
        onChangeText={(value) => {
          setDraft(value);
          if (errorKey !== undefined) setErrorKey(undefined);
        }}
        multiline
      />
      {saveError === undefined ? null : <InlineError code={saveError} />}
      <Button testID="comment-send" icon={Send} labelKey="comments.send" loading={busy} onPress={() => void send()} />
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 8 },
  item: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8, gap: 4 },
  meta: { flexDirection: "row", alignItems: "center", gap: 8 },
});
