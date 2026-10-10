import type { MediaMeta } from "@agrorende/contracts/sync";
import { Camera } from "lucide-react-native";
import { lazy, Suspense, useState } from "react";
import { StyleSheet, View } from "react-native";

import { errorCodeOf, LocalError } from "../../lib/errors";
import { useServices } from "../../lib/services";
import { Button, Chip, Text } from "../../ui";
import { InlineError } from "../../ui/recovery/InlineError";
import { annotateCapture } from "./annotation";
import { CameraSheet } from "./CameraSheet";
import { captureToDraft, countByTag, removeDraft, type CaptureDeps, type MediaDraft, type RawCapture } from "./drafts";
import { Thumbnails } from "./Thumbnails";
import { VoiceNoteButton } from "./VoiceNoteButton";

export * from "./annotation";
export * from "./drafts";
export { Silhouette } from "./Silhouette";
export { Thumbnails } from "./Thumbnails";

export type MediaCaptureProps = {
  readonly parent: MediaMeta["parent"];
  readonly allowedTags: readonly string[];
  /** Walkaround / gauge framing guide; defaults to the selected tag when it has a silhouette. */
  readonly silhouette?: string;
  readonly onChange: (drafts: readonly MediaDraft[]) => void;
  readonly value?: readonly MediaDraft[];
  readonly allowVideo?: boolean;
  readonly allowVoice?: boolean;
  readonly checklistItemKey?: string;
  readonly deps?: CaptureDeps;
  readonly onTypeNoteInstead?: () => void;
};

/** Camera + voice note + tag chips + thumbnail strip; every capture is durable before it is shown (§7.7). */
// Loaded on demand so the native image and video modules stay out of the first render.
const preparePhoto: NonNullable<CaptureDeps["preparePhoto"]> = async (uri, width, height) => (await import("../../media/processing")).processPhoto(uri, width, height);
const prepareVideoPoster: NonNullable<CaptureDeps["prepareVideoPoster"]> = async (uri) => (await import("../../media/processing")).processVideoPoster(uri);

export function MediaCapture({ parent, allowedTags, silhouette, onChange, value, allowVideo = true, allowVoice = true, checklistItemKey, deps, onTypeNoteInstead }: MediaCaptureProps) {
  const services = useServices();
  const [internal, setInternal] = useState<readonly MediaDraft[]>([]);
  const drafts = value ?? internal;
  const [tag, setTag] = useState(allowedTags[0] ?? "GENERAL");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [annotating, setAnnotating] = useState<MediaDraft | undefined>();
  const resolved: CaptureDeps | undefined =
    deps ?? (services.db !== undefined && services.files !== undefined ? { db: services.db, files: services.files, newId: services.newId ?? (() => `${Date.now()}`), now: services.now ?? Date.now, preparePhoto, prepareVideoPoster } : undefined);
  const counts = countByTag(drafts);

  const publish = (next: readonly MediaDraft[]) => {
    setInternal(next);
    onChange(next);
  };

  const add = async (raw: RawCapture) => {
    if (resolved === undefined) throw new LocalError("MEDIA_CAPTURE_FAILED");
    const draft = await captureToDraft(resolved, parent, { ...raw, ...(checklistItemKey === undefined ? {} : { checklistItemKey }) });
    publish([...drafts, draft]);
  };

  const handle = (raw: RawCapture) => {
    setError(undefined);
    add(raw).catch((e: unknown) => setError(errorCodeOf(e, "MEDIA_CAPTURE_FAILED")));
  };

  return (
    <View testID="media-capture" style={styles.wrap}>
      {allowedTags.length > 1 ? (
        <View style={styles.chips}>
          {allowedTags.map((t) => (
            <Chip key={t} testID={`media-tag-${t}`} labelKey={`media.tag.${t}`} selected={t === tag} onPress={() => setTag(t)} />
          ))}
        </View>
      ) : null}
      <Button testID="media-open-camera" icon={Camera} labelKey="media.capture.open" onPress={() => setCameraOpen(true)} />
      {allowVoice ? <VoiceNoteButton tag={tag} onCaptured={handle} onFailed={() => setError("VOICE_NOTE_FAILED")} {...(onTypeNoteInstead === undefined ? {} : { onTypeInstead: onTypeNoteInstead })} /> : null}
      {drafts.length > 0 ? <Text testID="media-count" i18nKey="media.capture.count" values={{ count: drafts.length, tagged: counts[tag] ?? 0 }} tone="secondary" variant="caption" /> : null}
      <Thumbnails
        drafts={drafts}
        {...(resolved?.files.writeTemp === undefined ? {} : { onAnnotate: (id: string) => setAnnotating(drafts.find((d) => d.id === id)) })}
        onDelete={(id) => {
          if (resolved === undefined) return;
          removeDraft(resolved, drafts, id)
            .then(publish)
            .catch((e: unknown) => setError(errorCodeOf(e, "MEDIA_CAPTURE_FAILED")));
        }}
      />
      {error === undefined ? null : <InlineError code={error} />}
      {annotating === undefined || resolved === undefined ? null : (
        <Suspense fallback={null}>
          <AnnotateSheet
            uri={annotating.localUri}
            onClose={() => setAnnotating(undefined)}
            onSave={async (base64) => {
              const updated = await annotateCapture(resolved, annotating, base64);
              publish(drafts.map((d) => (d.id === updated.id ? updated : d)));
              setAnnotating(undefined);
            }}
          />
        </Suspense>
      )}
      <CameraSheet
        visible={cameraOpen}
        tag={tag}
        allowVideo={allowVideo}
        {...(silhouette ?? tag ? { silhouette: silhouette ?? tag } : {})}
        onCaptured={(raw) => {
          setCameraOpen(false);
          handle(raw);
        }}
        onClose={() => setCameraOpen(false)}
        onFailed={() => {
          setCameraOpen(false);
          setError("MEDIA_CAPTURE_FAILED");
        }}
      />
    </View>
  );
}

// Skia loads only when a photo is being marked, keeping it out of the capture path and of unit tests.
const AnnotateSheet = lazy(() => import("./AnnotateSheet").then((m) => ({ default: m.AnnotateSheet })));

const styles = StyleSheet.create({ chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, wrap: { gap: 12 } });
