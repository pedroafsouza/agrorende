import { Canvas, Image as SkiaImage, ImageFormat, PaintStyle, Path, Skia, useImage, type SkImage } from "@shopify/react-native-skia";
import { Check, Undo2 } from "lucide-react-native";
import { useState } from "react";
import { Modal, StyleSheet, useWindowDimensions, View } from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";

import { Button, Chip, Text, useTheme } from "../../ui";
import { InlineError } from "../../ui/recovery/InlineError";
import { scaleShape, shapeFromDrag, shapeToSvgPath, type AnnotationShape, type AnnotationTool, type Point } from "./annotation";

const TOOLS: readonly AnnotationTool[] = ["circle", "arrow", "freehand"];
const STROKE = 6;

export type AnnotateSheetProps = {
  readonly uri: string;
  readonly onSave: (flattenedJpegBase64: string) => Promise<void>;
  readonly onClose: () => void;
};

function flatten(image: SkImage, shapes: readonly AnnotationShape[], displayWidth: number, color: string): string | undefined {
  const width = image.width();
  const height = image.height();
  const surface = Skia.Surface.MakeOffscreen(width, height);
  if (surface === null) return undefined;
  const canvas = surface.getCanvas();
  canvas.drawImage(image, 0, 0);
  const factor = width / displayWidth;
  const paint = Skia.Paint();
  paint.setColor(Skia.Color(color));
  paint.setStyle(PaintStyle.Stroke);
  paint.setStrokeWidth(STROKE * factor);
  paint.setAntiAlias(true);
  for (const shape of shapes) {
    const path = Skia.Path.MakeFromSVGString(shapeToSvgPath(scaleShape(shape, factor), 24 * factor));
    if (path !== null) canvas.drawPath(path, paint);
  }
  surface.flush();
  return surface.makeImageSnapshot().encodeToBase64(ImageFormat.JPEG, 85);
}

/** FR-04: circle, arrow or draw on a photo; saving flattens the marks into a new JPEG. */
export function AnnotateSheet({ uri, onSave, onClose }: AnnotateSheetProps) {
  const theme = useTheme();
  const window = useWindowDimensions();
  const image = useImage(uri);
  const [tool, setTool] = useState<AnnotationTool>("circle");
  const [shapes, setShapes] = useState<readonly AnnotationShape[]>([]);
  const [drag, setDrag] = useState<readonly Point[]>([]);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  const displayWidth = window.width;
  const displayHeight = image === null ? displayWidth : Math.min(window.height * 0.6, (displayWidth * image.height()) / image.width());
  const scaledWidth = image === null ? displayWidth : (displayHeight * image.width()) / image.height();

  const pan = Gesture.Pan()
    .runOnJS(true)
    .minDistance(0)
    .onBegin((e) => setDrag([{ x: e.x, y: e.y }]))
    .onUpdate((e) => setDrag((points) => [...points, { x: e.x, y: e.y }]))
    .onEnd(() => {
      setDrag((points) => {
        const shape = shapeFromDrag(tool, points);
        if (shape !== undefined) setShapes((current) => [...current, shape]);
        return [];
      });
    });

  const live = shapeFromDrag(tool, drag);
  const save = () => {
    if (image === null) return;
    setSaving(true);
    setFailed(false);
    const base64 = flatten(image, shapes, scaledWidth, theme.danger);
    (base64 === undefined ? Promise.reject(new Error("flatten")) : onSave(base64))
      .catch(() => setFailed(true))
      .finally(() => setSaving(false));
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <GestureHandlerRootView style={[styles.root, { backgroundColor: theme.background }]}>
        <View testID="annotate-sheet" style={styles.body}>
          <Text i18nKey="media.annotate.title" variant="heading" accessibilityRole="header" />
          <Text i18nKey="media.annotate.hint" tone="secondary" />
          <View style={styles.chips}>
            {TOOLS.map((t) => (
              <Chip key={t} testID={`annotate-tool-${t}`} labelKey={`media.annotate.${t}`} selected={t === tool} onPress={() => setTool(t)} />
            ))}
          </View>
          <GestureDetector gesture={pan}>
            <Canvas style={{ height: displayHeight, width: scaledWidth }}>
              {image === null ? null : <SkiaImage image={image} x={0} y={0} width={scaledWidth} height={displayHeight} fit="fill" />}
              {[...shapes, ...(live === undefined ? [] : [live])].map((shape, index) => (
                <Path key={index} path={shapeToSvgPath(shape)} style="stroke" strokeWidth={STROKE} strokeCap="round" strokeJoin="round" color={theme.danger} />
              ))}
            </Canvas>
          </GestureDetector>
          {failed ? <InlineError code="MEDIA_CAPTURE_FAILED" /> : null}
          {failed ? <Text i18nKey="media.annotate.failed" tone="secondary" /> : null}
          <View style={styles.actions}>
            <Button testID="annotate-undo" variant="secondary" icon={Undo2} labelKey="media.annotate.undo" disabled={shapes.length === 0} onPress={() => setShapes((current) => current.slice(0, -1))} />
            <Button testID="annotate-save" icon={Check} labelKey="media.annotate.save" disabled={shapes.length === 0 || image === null || saving} onPress={save} />
            <Button testID="annotate-cancel" variant="ghost" labelKey="ui.action.cancel" onPress={onClose} />
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  actions: { gap: 12 },
  body: { gap: 12, padding: 16, paddingTop: 48 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  root: { flex: 1 },
});
