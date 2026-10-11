import { providerLinks } from "@/features/providers/server";
import { providerLinkRoute } from "@/features/providers/publicRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `POST /provider-links/:token/counter`: the provider proposes a price in cents and/or a date (#64). */
export const POST = providerLinkRoute((token, body, options) => providerLinks.counterProviderLink(token, body, options));
