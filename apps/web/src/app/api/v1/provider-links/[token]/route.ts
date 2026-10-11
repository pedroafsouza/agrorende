import { providerLinks } from "@/features/providers/server";
import { providerLinkRoute } from "@/features/providers/publicRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `GET /provider-links/:token`: the minimal work-order view for the invited provider; marks the invite opened (#64). */
export const GET = providerLinkRoute((token, _body, options) => providerLinks.viewProviderLink(token, options));
