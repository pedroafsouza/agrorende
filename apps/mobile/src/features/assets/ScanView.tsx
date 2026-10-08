import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import { Keyboard as KeyboardIcon, Search } from "lucide-react-native";
import { useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { PermissionPrompt } from "../../components/PermissionPrompt";
import { errorCodeOf } from "../../lib/errors";
import { permissionStateOf } from "../../lib/permissions";
import { Button, Text, TextField, hapticSuccess } from "../../ui";
import { InlineError } from "../../ui/recovery/InlineError";
import { parseScanCode } from "./logic";

export type ScanViewProps = {
  /** Receives the lookup token (asset code, serial or plate); may throw a catalog error to show inline. */
  readonly onCode: (token: string) => Promise<void> | void;
  readonly fullScreen?: boolean;
};

/** QR/barcode scanner with a manual code entry fallback (PLT-05); camera blocked → type the code. */
export function ScanView({ onCode, fullScreen = false }: ScanViewProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [manual, setManual] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | undefined>();
  const busy = useRef(false);
  const state = permissionStateOf(permission);

  const submit = (raw: string) => {
    if (busy.current) return;
    busy.current = true;
    setError(undefined);
    Promise.resolve()
      .then(() => onCode(parseScanCode(raw)))
      .then(() => hapticSuccess())
      .catch((e: unknown) => setError(errorCodeOf(e, "SCAN_UNREADABLE")))
      .finally(() => {
        setTimeout(() => {
          busy.current = false;
        }, 1200);
      });
  };

  return (
    <View testID="scan-view" style={[styles.wrap, fullScreen && styles.full]}>
      {!manual && state === "granted" ? (
        <View style={[styles.camera, fullScreen && styles.full]}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["qr", "code128", "code39", "ean13", "datamatrix"] }}
            onBarcodeScanned={(result: BarcodeScanningResult) => submit(result.data)}
          />
          <View pointerEvents="none" style={styles.frame} />
        </View>
      ) : null}
      {!manual && state !== "granted" ? (
        <PermissionPrompt
          kind="camera"
          state={state}
          onRequest={() => {
            requestPermission().catch(() => undefined);
          }}
          onAlternate={() => setManual(true)}
        />
      ) : null}
      {manual ? (
        <View style={styles.wrap}>
          <TextField testID="scan-manual-input" labelKey="assets.scan.manualLabel" hintKey="assets.scan.manualHint" autoCapitalize="characters" value={code} onChangeText={setCode} onSubmitEditing={() => submit(code)} />
          <Button testID="scan-manual-submit" icon={Search} labelKey="assets.scan.find" disabled={code.trim().length === 0} onPress={() => submit(code)} />
        </View>
      ) : (
        <Text i18nKey="assets.scan.aim" tone="secondary" style={styles.center} />
      )}
      {error === undefined ? null : <InlineError testID="scan-error" code={error} />}
      <Button testID="scan-toggle-manual" variant="ghost" icon={KeyboardIcon} labelKey={manual ? "assets.scan.useCamera" : "assets.scan.typeCode"} onPress={() => setManual((m) => !m)} />
    </View>
  );
}

const styles = StyleSheet.create({
  camera: { borderRadius: 16, height: 320, overflow: "hidden" },
  center: { textAlign: "center" },
  frame: { alignSelf: "center", borderColor: "#FFFFFF", borderRadius: 16, borderWidth: 3, height: 200, marginTop: 60, width: 200 },
  full: { flex: 1 },
  wrap: { gap: 12 },
});
