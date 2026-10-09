import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { setAuthConfigForTests } from "../../auth/config.js";
import { setOAuthConfigForTests } from "../../auth/oidc.js";
import { isAllowedAppRedirect, issueSignupTicket, pkceChallenge, verifySignupTicket, type SignupIdentity } from "./signupTicket.js";

const identity: SignupIdentity = {
  provider: "GOOGLE",
  subject: "google-sub-signup-ticket",
  email: "owner@example.com",
  emailVerified: true,
  isPrivateRelay: false,
  name: "Owner",
};
const challenge = pkceChallenge("v".repeat(64));

beforeAll(() => {
  setAuthConfigForTests({ jwtSecret: "signup-ticket-test-secret-0123456789abcdef" });
  setOAuthConfigForTests({ mobileSchemes: ["agrorende", "agrorende-dev", "agrorende-preview"] });
});

afterAll(() => {
  setOAuthConfigForTests(null);
  setAuthConfigForTests(null);
});

describe("sign-up ticket app redirect", () => {
  it.each(["agrorende://auth/callback", "agrorende-dev://auth/callback", "agrorende-preview://auth/callback", "AgroRende-Dev://auth/callback"])(
    "accepts %s from OAUTH_MOBILE_SCHEMES and keeps it in the ticket",
    async (uri) => {
      expect(isAllowedAppRedirect(uri)).toBe(true);
      const { ticket } = await issueSignupTicket(identity, { client: "app", appRedirectUri: uri, codeChallenge: challenge });
      const claims = await verifySignupTicket(ticket);
      expect(claims).toMatchObject({ client: "app", appRedirectUri: uri, codeChallenge: challenge });
    },
  );

  it.each(["https://evil.example/auth/callback", "other-app://auth/callback", "agrorende-dev:auth", "agrorende://auth/callback?next=https://evil.example", "javascript://alert"])(
    "rejects %s",
    async (uri) => {
      expect(isAllowedAppRedirect(uri)).toBe(false);
      await expect(issueSignupTicket(identity, { client: "app", appRedirectUri: uri, codeChallenge: challenge })).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    },
  );

  it("follows the configured allowlist instead of a fixed scheme", async () => {
    setOAuthConfigForTests({ mobileSchemes: ["agrorende-preview"] });
    try {
      expect(isAllowedAppRedirect("agrorende-preview://auth/callback")).toBe(true);
      expect(isAllowedAppRedirect("agrorende://auth/callback")).toBe(false);
    } finally {
      setOAuthConfigForTests({ mobileSchemes: ["agrorende", "agrorende-dev", "agrorende-preview"] });
    }
  });
});
