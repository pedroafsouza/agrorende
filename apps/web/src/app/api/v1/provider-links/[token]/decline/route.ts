import { providerLinks } from "@/features/providers/server";
import { providerLinkRoute } from "@/features/providers/publicRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `POST /provider-links/:token/decline`: the provider declines with an optional reason (#64). */
export const POST = providerLinkRoute((token, body, options) => providerLinks.declineProviderLink(token, body, options));
