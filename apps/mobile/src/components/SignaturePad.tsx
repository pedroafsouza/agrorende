import { notImplemented } from "../lib/notImplemented";

export type SignatureStatus = "SIGNED" | "ABSENT" | "REFUSED";
export type SignatureResult = { readonly status: SignatureStatus; readonly signerName?: string; readonly signerDocument?: string; readonly signerRole?: string; readonly reason?: string; readonly mediaId?: string };
export type SignaturePadProps = { readonly documentLocale: string; readonly onSigned: (result: SignatureResult) => void };
export function SignaturePad(_props: SignaturePadProps): never { return notImplemented("components.SignaturePad"); }
