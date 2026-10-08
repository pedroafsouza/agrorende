import { describe, expect, it } from "vitest";

import { AgrorendeApiClient, type FetchLike } from "./index.js";

describe("AgrorendeApiClient", () => {
  it("builds API URLs and injects bearer tokens", async () => {
    const seen: { url?: string; auth?: string | null } = {};
    const fetchImpl: FetchLike = async (input, init) => {
      seen.url = String(input);
      seen.auth = new Headers(init?.headers).get("authorization");
      return new Response(JSON.stringify({ ok: true, app: "agrorende" }), { status: 200 });
    };
    const client = new AgrorendeApiClient({ baseUrl: "https://api.example.test/root/", tokenProvider: () => "token-1", fetch: fetchImpl });

    await client.health();

    expect(seen.url).toBe("https://api.example.test/api/v1/health");
    expect(seen.auth).toBeNull();
  });

  it("serializes query parameters", async () => {
    let url = "";
    const fetchImpl: FetchLike = async (input) => {
      url = String(input);
      return new Response(JSON.stringify({ items: [], nextCursor: null }), { status: 200 });
    };
    const client = new AgrorendeApiClient({ baseUrl: "https://api.example.test", fetch: fetchImpl });

    await client.listAssets({ cursor: "abc", limit: 10, archived: false, missing: undefined });

    expect(url).toBe("https://api.example.test/api/v1/assets?cursor=abc&limit=10&archived=false");
  });

  it("decodes API error envelopes into AppError", async () => {
    const fetchImpl: FetchLike = async () =>
      new Response(
        JSON.stringify({ error: { code: "UNAUTHENTICATED", message: "No token", retryable: false, ref: "ABCD-1234" } }),
        { status: 401 },
      );
    const client = new AgrorendeApiClient({ baseUrl: "https://api.example.test", fetch: fetchImpl });

    await expect(client.me()).rejects.toMatchObject({ code: "UNAUTHENTICATED", ref: "ABCD-1234" });
  });
});
