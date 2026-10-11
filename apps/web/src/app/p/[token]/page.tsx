import { AppError } from "@agrorende/contracts/errors";
import type { ProviderLinkViewDTO } from "@agrorende/contracts";
import type { Metadata } from "next";
import { headers } from "next/headers";

import { providerClientKey } from "@/features/providers/clientKey";
import { ProviderLinkPage, ProviderLinkRecovery, type ProviderLinkFailure } from "@/features/providers/ProviderLinkPage";
import { providerLinks } from "@/features/providers/server";
import { PublicFrame } from "@/features/shell/auth/PublicFrame";

export const dynamic = "force-dynamic";

/** The magic link is a credential: keep it out of search engines and referrers. */
export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

function siteUrl(): string {
  return (process.env.SITE_URL ?? "https://agrorende.com.br").replace(/\/$/u, "");
}

type Loaded = { readonly view: ProviderLinkViewDTO } | { readonly failure: ProviderLinkFailure } | { readonly view: null };

async function load(token: string): Promise<Loaded> {
  try {
    return { view: await providerLinks.viewProviderLink(token, { clientKey: providerClientKey(await headers()) }) };
  } catch (error: unknown) {
    if (error instanceof AppError && error.code === "INVITE_EXPIRED") {
      const details = error.details;
      const reason = typeof details === "object" && details !== null && "reason" in details ? details.reason : null;
      return { failure: reason === "expired" || reason === "revoked" ? reason : "invalid" };
    }
    // Rate limits and transient failures fall back to the client fetch, which shows the recovery alert with a retry.
    return { view: null };
  }
}

/** Public, no-login page for an invited provider (#64). */
export default async function ProviderLinkRoute({ params }: { readonly params: Promise<{ token: string }> }) {
  const { token } = await params;
  const loaded = await load(token);
  const home = siteUrl();
  return (
    <PublicFrame>
      {"failure" in loaded ? (
        <ProviderLinkRecovery homeUrl={home} reason={loaded.failure} />
      ) : (
        <ProviderLinkPage homeUrl={home} initial={loaded.view} signupUrl={`${home}/prestadores?origem=convite`} token={token} />
      )}
    </PublicFrame>
  );
}
