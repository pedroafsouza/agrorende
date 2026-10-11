import { providerLinks } from "@/features/providers/server";
import { providerLinkRoute } from "@/features/providers/publicRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `POST /provider-links/:token/paid`: the provider confirms the off-platform payment (#65). */
export const POST = providerLinkRoute((token, _body, options) => providerLinks.markPaidByProvider(token, options));
