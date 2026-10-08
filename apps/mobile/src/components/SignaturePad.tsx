import type { MediaMeta } from "@agrorende/contracts/sync";
import { Eraser, PenLine } from "lucide-react-native";
import { useRef, useState } from "react";
import { Modal, StyleSheet, View } from "react-native";
import SignatureView, { type SignatureViewRef } from "react-native-signature-canvas";

import { errorCodeOf, LocalError } from "../lib/errors";
import { useServices } from "../lib/services";
import { Button, Header, Segmented, Text, TextField, hapticSuccess, useTheme } from "../ui";
import { InlineError } from "../ui/recovery/InlineError";
import { captureToDraft, type CaptureDeps, type MediaDraft } from "./MediaCapture/drafts";

export type SignatureStatus = "SIGNED" | "ABSENT" | "REFUSED";
export type SignatureResult = {
  readonly status: SignatureStatus;
  readonly signerName?: string;
  readonly signerDocument?: string;
  readonly signerRole?: string;
  readonly reason?: string;
  readonly mediaId?: string;
  readonly media?: MediaDraft;
};
export type SignaturePadProps = {
  readonly documentLocale: string;
  readonly onSigned: (result: SignatureResult) => void;
  readonly parent?: MediaMeta["parent"];
  readonly tag?: "SIGNATURE_CUSTOMER" | "SIGNATURE_AGENT" | "SIGNATURE_TECHNICIAN";
  readonly signerRole?: string;
  readonly allowAbsent?: boolean;
  readonly requireDocument?: boolean;
  readonly deps?: CaptureDeps;
};

const STATUS_OPTIONS = [
  { value: "SIGNED", labelKey: "ui.signature.signed" },
  { value: "ABSENT", labelKey: "ui.signature.absent" },
  { value: "REFUSED", labelKey: "ui.signature.refused" },
] as const;

const WEB_STYLE = ".m-signature-pad--footer { display: none; } .m-signature-pad { box-shadow: none; border: none; } body,html { height: 100%; }";

function stripDataUrl(dataUrl: string): string {
  const comma = dataUrl.indexOf(",");
  return comma === -1 ? dataUrl : dataUrl.slice(comma + 1);
}

/** Signer fields + full-screen canvas; absent/refused needs a reason (RN-04, WO-10). PNG stored via MediaCapture storage. */
export function SignaturePad({ documentLocale, onSigned, parent, tag = "SIGNATURE_CUSTOMER", signerRole, allowAbsent = true, requireDocument = false, deps }: SignaturePadProps) {
  const theme = useTheme();
  const services = useServices();
  const pad = useRef<SignatureViewRef>(null);
  const [status, setStatus] = useState<SignatureStatus>("SIGNED");
  const [name, setName] = useState("");
  const [document, setDocument] = useState("");
  const [reason, setReason] = useState("");
  const [canvasOpen, setCanvasOpen] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const resolved: CaptureDeps | undefined =
    deps ?? (services.db !== undefined && services.files !== undefined ? { db: services.db, files: services.files, newId: services.newId ?? (() => `${Date.now()}`), now: services.now ?? Date.now } : undefined);
  const signerOk = name.trim().length > 1 && (!requireDocument || document.trim().length > 3);
  const base = { ...(signerRole === undefined ? {} : { signerRole }) };

  const save = async (dataUrl: string) => {
    let media: MediaDraft | undefined;
    if (parent !== undefined) {
      if (resolved === undefined || services.files?.writeTemp === undefined) throw new LocalError("MEDIA_CAPTURE_FAILED");
      const id = resolved.newId();
      const temp = await services.files.writeTemp(`${id}.png`, stripDataUrl(dataUrl));
      media = await captureToDraft(resolved, parent, { kind: "SIGNATURE", tag, mimeType: "image/png", sourceUri: temp });
    }
    hapticSuccess();
    setCanvasOpen(false);
    onSigned({ status: "SIGNED", signerName: name.trim(), ...(document.trim().length > 0 ? { signerDocument: document.trim() } : {}), ...base, ...(media === undefined ? {} : { mediaId: media.id, media }) });
  };

  return (
    <View testID="signature-pad" style={styles.wrap}>
      <Segmented testID="signature-status" options={allowAbsent ? STATUS_OPTIONS : STATUS_OPTIONS.filter((o) => o.value === "SIGNED")} value={status} onChange={setStatus} />
      {status === "SIGNED" ? (
        <>
          <TextField testID="signature-name" labelKey="ui.signature.name" value={name} onChangeText={setName} autoComplete="name" />
          <TextField testID="signature-document" labelKey={requireDocument ? "ui.signature.document" : "ui.signature.documentOptional"} value={document} onChangeText={setDocument} keyboardType="numbers-and-punctuation" />
          <Button testID="signature-open" icon={PenLine} labelKey="ui.signature.sign" disabled={!signerOk} onPress={() => setCanvasOpen(true)} />
        </>
      ) : (
        <>
          <TextField testID="signature-reason" labelKey={status === "ABSENT" ? "ui.signature.absentReason" : "ui.signature.refusedReason"} multiline value={reason} onChangeText={setReason} />
          <Button
            testID="signature-confirm-reason"
            labelKey="ui.signature.confirmWithout"
            disabled={reason.trim().length < 3}
            onPress={() => onSigned({ status, reason: reason.trim(), ...(name.trim().length > 0 ? { signerName: name.trim() } : {}), ...base })}
          />
        </>
      )}
      {error === undefined ? null : <InlineError code={error} />}
      <Modal visible={canvasOpen} animationType="slide" supportedOrientations={["landscape", "portrait"]} onRequestClose={() => setCanvasOpen(false)}>
        <View testID="signature-canvas" style={[styles.canvasWrap, { backgroundColor: theme.background }]}>
          <Header titleKey="ui.signature.title" subtitle={name} />
          <Text i18nKey="ui.signature.statement" values={{ name, locale: documentLocale }} tone="secondary" />
          <View style={[styles.canvas, { borderColor: theme.border }]}>
            <SignatureView
              ref={pad}
              webStyle={WEB_STYLE}
              onOK={(dataUrl: string) => {
                save(dataUrl).catch((e: unknown) => {
                  setCanvasOpen(false);
                  setError(errorCodeOf(e, "MEDIA_CAPTURE_FAILED"));
                });
              }}
              onEmpty={() => setError("GUARD_SIGNATURE_REQUIRED")}
            />
          </View>
          <View style={styles.row}>
            <View style={styles.flex}>
              <Button variant="secondary" icon={Eraser} labelKey="ui.signature.clear" onPress={() => pad.current?.clearSignature()} />
            </View>
            <View style={styles.flex}>
              <Button testID="signature-save" labelKey="ui.signature.save" onPress={() => pad.current?.readSignature()} />
            </View>
          </View>
          <Button variant="ghost" labelKey="ui.action.cancel" onPress={() => setCanvasOpen(false)} />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: { borderRadius: 12, borderWidth: 2, flex: 1, overflow: "hidden" },
  canvasWrap: { flex: 1, gap: 12, padding: 16 },
  flex: { flex: 1 },
  row: { flexDirection: "row", gap: 12 },
  wrap: { gap: 12 },
});
