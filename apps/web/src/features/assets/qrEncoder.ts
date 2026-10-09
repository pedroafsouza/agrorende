import type { QrEncoder } from "@agrorende/core/modules/assets/qrSheet";
import QRCode from "qrcode";

/** Same error-correction level as the single PNG label, so the sheet and the PNG print and scan alike. */
export const encodeQr: QrEncoder = (text) => {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: "H" });
  return { size: modules.size, isDark: (row, col) => modules.get(row, col) === 1 };
};
