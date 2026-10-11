import { providerLinks } from "@/features/providers/server";
import { providerLinkRoute } from "@/features/providers/publicRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `POST /provider-links/:token/complete`: the provider marks the job done with a note (#64). */
export const POST = providerLinkRoute((token, body, options) => providerLinks.completeProviderLink(token, body, options));
