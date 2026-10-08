import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from "expo-audio";
import { Mic, Square } from "lucide-react-native";
import { useRef, useState } from "react";

import { permissionStateOf, type PermissionState } from "../../lib/permissions";
import { Button } from "../../ui";
import { PermissionPrompt } from "../PermissionPrompt";
import type { RawCapture } from "./drafts";

export type VoiceNoteButtonProps = {
  readonly tag: string;
  readonly onCaptured: (raw: RawCapture) => void;
  readonly onFailed: () => void;
  /** ALT path: type a note instead (permission matrix). */
  readonly onTypeInstead?: () => void;
};

export function VoiceNoteButton({ tag, onCaptured, onFailed, onTypeInstead }: VoiceNoteButtonProps) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [recording, setRecording] = useState(false);
  const [permission, setPermission] = useState<PermissionState>("granted");
  const started = useRef(0);

  const start = async () => {
    const response = await requestRecordingPermissionsAsync();
    const state = permissionStateOf(response);
    setPermission(state);
    if (state !== "granted") return;
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    started.current = Date.now();
    setRecording(true);
  };

  const stop = async () => {
    await recorder.stop();
    setRecording(false);
    await setAudioModeAsync({ allowsRecording: false });
    const uri = recorder.uri;
    if (uri === null) throw new Error("no recording");
    onCaptured({ kind: "AUDIO", tag, mimeType: "audio/mp4", sourceUri: uri, durationMs: Date.now() - started.current });
  };

  if (permission !== "granted") {
    return (
      <PermissionPrompt
        kind="microphone"
        state={permission}
        onRequest={() => {
          start().catch(onFailed);
        }}
        {...(onTypeInstead === undefined ? {} : { onAlternate: onTypeInstead })}
      />
    );
  }
  return (
    <Button
      testID="voice-note"
      variant={recording ? "danger" : "secondary"}
      icon={recording ? Square : Mic}
      labelKey={recording ? "media.voice.stop" : "media.voice.record"}
      onPress={() => {
        (recording ? stop() : start()).catch(() => {
          setRecording(false);
          onFailed();
        });
      }}
    />
  );
}
