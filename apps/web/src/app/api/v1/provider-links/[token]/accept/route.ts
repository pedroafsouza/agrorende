import { providerLinks } from "@/features/providers/server";
import { providerLinkRoute } from "@/features/providers/publicRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `POST /provider-links/:token/accept`: the provider accepts the job (#64). */
export const POST = providerLinkRoute((token, _body, options) => providerLinks.acceptProviderLink(token, options));
