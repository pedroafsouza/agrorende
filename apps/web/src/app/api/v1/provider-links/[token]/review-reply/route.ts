import { providerLinks } from "@/features/providers/server";
import { providerLinkRoute } from "@/features/providers/publicRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `POST /provider-links/:token/review-reply`: the provider single reply to the review (#66). */
export const POST = providerLinkRoute((token, body, options) => providerLinks.replyToReviewByProvider(token, body, options));
