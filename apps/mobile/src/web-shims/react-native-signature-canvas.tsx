/**
 * Web stand-in for `react-native-signature-canvas` (development web preview only).
 *
 * The real package draws inside a react-native-webview, which does not exist on the web, so
 * `metro.config.cjs` resolves the package to this file when the platform is `web`. It keeps the
 * same ref API (`readSignature`, `clearSignature`) and callbacks (`onOK`, `onEmpty`) and draws on a
 * plain canvas with pointer events, so mouse, pen and touch all work. Native builds never load it.
 */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, type PointerEvent } from "react";

export type SignatureViewRef = {
  readonly readSignature: () => void;
  readonly clearSignature: () => void;
};

type SignatureViewProps = {
  readonly onOK?: (dataUrl: string) => void;
  readonly onEmpty?: () => void;
  readonly penColor?: string;
  readonly webStyle?: string;
};

const SignatureView = forwardRef<SignatureViewRef, SignatureViewProps>(function SignatureView({ onOK, onEmpty, penColor = "#1C1F23" }, ref) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const dirty = useRef(false);

  const fit = useCallback(() => {
    const element = canvas.current;
    if (element === null) return;
    const ratio = window.devicePixelRatio || 1;
    const { width, height } = element.getBoundingClientRect();
    element.width = Math.max(1, Math.round(width * ratio));
    element.height = Math.max(1, Math.round(height * ratio));
    const context = element.getContext("2d");
    if (context === null) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = 3;
    context.strokeStyle = penColor;
    dirty.current = false;
  }, [penColor]);

  useEffect(() => {
    fit();
  }, [fit]);

  const point = (event: PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  useImperativeHandle(ref, () => ({
    readSignature: () => {
      const element = canvas.current;
      if (element === null || !dirty.current) {
        onEmpty?.();
        return;
      }
      onOK?.(element.toDataURL("image/png"));
    },
    clearSignature: fit,
  }));

  return (
    <canvas
      ref={canvas}
      data-testid="signature-web-canvas"
      style={{ width: "100%", height: "100%", touchAction: "none", cursor: "crosshair", display: "block" }}
      onPointerDown={(event) => {
        const context = event.currentTarget.getContext("2d");
        if (context === null) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        drawing.current = true;
        const { x, y } = point(event);
        context.beginPath();
        context.moveTo(x, y);
      }}
      onPointerMove={(event) => {
        if (!drawing.current) return;
        const context = event.currentTarget.getContext("2d");
        if (context === null) return;
        const { x, y } = point(event);
        context.lineTo(x, y);
        context.stroke();
        dirty.current = true;
      }}
      onPointerUp={() => {
        drawing.current = false;
      }}
      onPointerCancel={() => {
        drawing.current = false;
      }}
    />
  );
});

export default SignatureView;
