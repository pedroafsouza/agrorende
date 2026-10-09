import { CameraView, useCameraPermissions, useMicrophonePermissions, type CameraMode } from "expo-camera";
import { Camera, Circle, Square, Video, X } from "lucide-react-native";
import { useRef, useState } from "react";
import { Modal, StyleSheet, View } from "react-native";

import { permissionStateOf } from "../../lib/permissions";
import { IconButton, Segmented, Text, hapticTap, useTheme } from "../../ui";
import { PermissionPrompt } from "../PermissionPrompt";
import type { RawCapture } from "./drafts";
import { Silhouette } from "./Silhouette";

export type CameraSheetProps = {
  readonly visible: boolean;
  readonly tag: string;
  readonly allowVideo: boolean;
  readonly silhouette?: string;
  readonly onCaptured: (raw: RawCapture) => void;
  readonly onClose: () => void;
  readonly onFailed: () => void;
};

/** Full-screen in-app camera with photo/video toggle and an optional silhouette overlay. */
export function CameraSheet({ visible, tag, allowVideo, silhouette, onCaptured, onClose, onFailed }: CameraSheetProps) {
  const theme = useTheme();
  const camera = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [micPermission, requestMic] = useMicrophonePermissions();
  const [mode, setMode] = useState<CameraMode>("picture");
  const [recording, setRecording] = useState(false);
  const cameraState = permissionStateOf(permission);

  const shoot = async () => {
    const view = camera.current;
    if (view === null) return;
    hapticTap();
    if (mode === "picture") {
      const photo = await view.takePictureAsync({ quality: 0.8, exif: false });
      onCaptured({ kind: "PHOTO", tag, mimeType: "image/jpeg", sourceUri: photo.uri, width: photo.width, height: photo.height });
      return;
    }
    if (recording) {
      view.stopRecording();
      return;
    }
    if (permissionStateOf(micPermission) !== "granted") await requestMic();
    setRecording(true);
    const started = Date.now();
    const video = await view.recordAsync({ maxDuration: 60 });
    setRecording(false);
    if (video !== undefined) onCaptured({ kind: "VIDEO", tag, mimeType: "video/mp4", sourceUri: video.uri, durationMs: Date.now() - started });
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} supportedOrientations={["portrait", "landscape"]}>
      <View testID="camera-sheet" style={[styles.fill, { backgroundColor: theme.background }]}>
        {cameraState === "granted" ? (
          <CameraView ref={camera} style={styles.fill} mode={mode} facing="back" onMountError={onFailed}>
            {silhouette === undefined ? null : <Silhouette tag={silhouette} />}
          </CameraView>
        ) : (
          <View style={styles.prompt}>
            <PermissionPrompt
              kind="camera"
              state={cameraState}
              onRequest={() => {
                requestPermission().catch(() => undefined);
              }}
            />
          </View>
        )}
        <View style={[styles.bar, { backgroundColor: theme.surfaceRaised }]}>
          {allowVideo ? (
            <Segmented
              options={[
                { value: "picture", labelKey: "media.capture.photo", icon: Camera },
                { value: "video", labelKey: "media.capture.video", icon: Video },
              ]}
              value={mode}
              onChange={(value) => setMode(value as CameraMode)}
            />
          ) : null}
          <View style={styles.row}>
            <IconButton testID="camera-close" icon={X} labelKey="ui.action.close" onPress={onClose} />
            <IconButton
              testID="camera-shutter"
              icon={recording ? Square : Circle}
              labelKey={mode === "picture" ? "media.capture.shoot" : recording ? "media.capture.stop" : "media.capture.record"}
              disabled={cameraState !== "granted"}
              onPress={() => {
                shoot().catch(() => {
                  setRecording(false);
                  onFailed();
                });
              }}
            />
          </View>
          {recording ? <Text i18nKey="media.capture.recording" tone="danger" /> : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  bar: { gap: 12, padding: 16 },
  fill: { flex: 1 },
  prompt: { flex: 1, justifyContent: "center", padding: 16 },
  row: { alignItems: "center", flexDirection: "row", justifyContent: "space-around" },
});
