import { Linking } from "react-native";

import { LocalError } from "../../lib/errors";
import type { OfficeContact, RecoveryContext } from "./config";

const digits = (value: string) => value.replace(/[^\d]/g, "");

/** Opens WhatsApp with a prefilled message, falling back to a phone call (EC "Ask the office"). */
export async function contactOffice(office: OfficeContact | undefined, context: RecoveryContext, text: string): Promise<"whatsapp" | "phone"> {
  const whatsapp = office?.whatsapp ?? office?.phone;
  if (whatsapp === undefined && office?.phone === undefined) throw new LocalError("OFFICE_CONTACT_MISSING", { details: { code: context.code } });
  if (whatsapp !== undefined) {
    const url = `https://wa.me/${digits(whatsapp)}?text=${encodeURIComponent(text)}`;
    try {
      await Linking.openURL(url);
      return "whatsapp";
    } catch (_error) {
      // Fall through to a phone call.
    }
  }
  if (office?.phone !== undefined) {
    try {
      await Linking.openURL(`tel:${digits(office.phone)}`);
      return "phone";
    } catch (_error) {
      throw new LocalError("WHATSAPP_UNAVAILABLE");
    }
  }
  throw new LocalError("WHATSAPP_UNAVAILABLE");
}
