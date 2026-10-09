import type { AgrorendeApiClient, LoginResponse, OAuthIntent } from "@agrorende/api-client";
import type { Platform } from "@agrorende/contracts/enums";
import { isAppErrorCode } from "@agrorende/contracts/errors";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import * as WebBrowser from "expo-web-browser";

import { LocalError } from "../lib/errors";

function base64Url(base64: string): string {
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomString(bytes = 32): string {
  const values = Crypto.getRandomBytes(bytes);
  return base64Url(btoa(String.fromCharCode(...values)));
}

/** PKCE pair (S256) for the system-browser OAuth flow (§8). */
export async function createPkcePair(): Promise<{ readonly verifier: string; readonly challenge: string }> {
  const verifier = randomString(48);
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, { encoding: Crypto.CryptoEncoding.BASE64 });
  return { verifier, challenge: base64Url(digest) };
}

export interface OAuthContext {
  readonly api: Pick<AgrorendeApiClient, "oauthStartUrl" | "oauthExchange" | "appleLogin">;
  readonly deviceId: string;
  readonly platform: Extract<Platform, "IOS" | "ANDROID">;
  readonly redirectUri: string;
  readonly intent?: OAuthIntent;
  readonly inviteCode?: string;
}

/** Google sign-in: system browser + PKCE; cancelling becomes quiet `OAUTH_CANCELLED`. */
export async function signInWithGoogle(ctx: OAuthContext): Promise<LoginResponse> {
  const { verifier, challenge } = await createPkcePair();
  const url = ctx.api.oauthStartUrl("google", {
    redirect: ctx.redirectUri,
    challenge,
    platform: ctx.platform,
    intent: ctx.intent ?? "signin",
    ...(ctx.inviteCode === undefined ? {} : { inviteCode: ctx.inviteCode }),
  });
  const result = await WebBrowser.openAuthSessionAsync(url, ctx.redirectUri);
  if (result.type !== "success") throw new LocalError("OAUTH_CANCELLED");
  const params = new URL(result.url).searchParams;
  const error = params.get("error");
  if (error !== null) throw new LocalError(isAppErrorCode(error) ? error : "OAUTH_PROVIDER_ERROR", { details: { error } });
  const code = params.get("code");
  if (code === null) throw new LocalError("OAUTH_PROVIDER_ERROR");
  return ctx.api.oauthExchange({ code, verifier, deviceId: ctx.deviceId, platform: ctx.platform });
}

export async function isAppleSignInAvailable(): Promise<boolean> {
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch (_error) {
    return false;
  }
}

/** Native Sign in with Apple (iOS) with a hashed nonce. */
export async function signInWithApple(ctx: OAuthContext): Promise<LoginResponse> {
  const rawNonce = randomString(24);
  const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
      nonce: hashed,
    });
  } catch (error) {
    if ((error as { code?: string }).code === "ERR_REQUEST_CANCELED") throw new LocalError("OAUTH_CANCELLED");
    throw new LocalError("OAUTH_PROVIDER_ERROR", { cause: error });
  }
  if (credential.identityToken === null || credential.authorizationCode === null) throw new LocalError("OAUTH_PROVIDER_ERROR");
  return ctx.api.appleLogin({
    identityToken: credential.identityToken,
    authorizationCode: credential.authorizationCode,
    rawNonce,
    fullName: credential.fullName === null ? null : { givenName: credential.fullName.givenName, familyName: credential.fullName.familyName },
    deviceId: ctx.deviceId,
    platform: ctx.platform,
    intent: ctx.intent ?? "signin",
    ...(ctx.inviteCode === undefined ? {} : { inviteCode: ctx.inviteCode }),
  });
}
