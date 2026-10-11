import { providerLinks } from "@/features/providers/server";
import { providerLinkRoute } from "@/features/providers/publicRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `POST /provider-links/:token/review-report`: the provider flags the review for moderation (#66). */
export const POST = providerLinkRoute((token, body, options) => providerLinks.reportReviewByProvider(token, body, options));
