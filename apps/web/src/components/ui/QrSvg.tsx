"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";

/** Renders `value` as an inline SVG QR code (high error correction, so it survives worn prints). */
export function QrSvg({ value, label, size = 192 }: { readonly value: string; readonly label: string; readonly size?: number }) {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    QRCode.toString(value, { type: "svg", errorCorrectionLevel: "H", margin: 1, width: size })
      .then((markup) => {
        if (active) setSvg(markup);
      })
      .catch(() => {
        if (active) setSvg(null);
      });
    return () => {
      active = false;
    };
  }, [value, size]);
  if (svg === null) return null;
  return <div aria-label={label} className="bg-white p-2" dangerouslySetInnerHTML={{ __html: svg }} role="img" style={{ width: size, height: size }} />;
}
