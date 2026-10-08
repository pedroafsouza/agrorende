import { describe, expect, it, vi } from "vitest";

import { ERROR_META } from "@agrorende/contracts/errors";
import type { PullResponse, PushRequest, PushResponse } from "@agrorende/contracts/sync";

import { AgrorendeApiClient, ApiError, isApiError, parseRetryAfter, type FetchLike } from "./index.js";

interface Call {
  readonly url: string;
  readonly init: RequestInit | undefined;
}

function recorder(respond: (call: Call, index: number) => Response | Promise<Response>): { fetch: FetchLike; calls: Call[] } {
  const calls: Call[] = [];
  const fetchImpl: FetchLike = async (input, init) => {
    const call = { url: String(input), init };
    calls.push(call);
    return respond(call, calls.length - 1);
  };
  return { fetch: fetchImpl, calls };
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

const envelope = (code: string, retryable: boolean, ref = "ABCD-1234") => ({ error: { code, message: `${code} happened`, retryable, ref } });

const BASE = "https://api.example.test";
const DEVICE_ID = "0190d9d4-6a1f-7c3e-8a6b-2f0d5e4c3b21";

async function catchError(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("expected rejection");
}

describe("ApiError mapping", () => {
  it("maps an envelope to status, retryable, recovery, ref and retryAfterMs", async () => {
    const { fetch } = recorder(() => json(envelope("RATE_LIMITED", true, "WXYZ-0001"), 429, { "retry-after": "30" }));
    const client = new AgrorendeApiClient({ baseUrl: BASE, fetch });

    const error = await catchError(client.listAssets());

    expect(isApiError(error)).toBe(true);
    const apiError = error as ApiError;
    expect(apiError).toBeInstanceOf(ApiError);
    expect(apiError.code).toBe("RATE_LIMITED");
    expect(apiError.status).toBe(429);
    expect(apiError.retryable).toBe(true);
    expect(apiError.recovery).toEqual(ERROR_META.RATE_LIMITED.recovery);
    expect(apiError.ref).toBe("WXYZ-0001");
    expect(apiError.retryAfterMs).toBe(30_000);
    expect(apiError.message).toBe("RATE_LIMITED happened");
  });

  it("keeps details and field errors from the envelope and prefers the envelope retryable flag", async () => {
    const body = {
      error: {
        code: "VALIDATION_FAILED",
        message: "bad",
        retryable: true,
        ref: "AAAA-BBBB",
        details: { context: "import" },
        fieldErrors: [{ path: "name", code: "REQUIRED" }],
      },
    };
    const { fetch } = recorder(() => json(body, 422));
    const client = new AgrorendeApiClient({ baseUrl: BASE, fetch });

    const error = (await catchError(client.createAsset({ name: "" }))) as ApiError;

    expect(error.code).toBe("VALIDATION_FAILED");
    expect(error.retryable).toBe(true);
    expect(error.details).toEqual({ context: "import" });
    expect(error.fieldErrors).toEqual([{ path: "name", code: "REQUIRED" }]);
    expect(error.retryAfterMs).toBeUndefined();
  });

  it("maps a non-envelope body to INTERNAL with the HTTP status", async () => {
    const { fetch } = recorder(() => new Response("<html>Bad gateway</html>", { status: 502 }));
    const client = new AgrorendeApiClient({ baseUrl: BASE, fetch });

    const error = (await catchError(client.me())) as ApiError;

    expect(error.code).toBe("INTERNAL");
    expect(error.status).toBe(502);
    expect(error.retryable).toBe(true);
    expect(error.recovery).toEqual(ERROR_META.INTERNAL.recovery);
  });

  it("maps an unknown envelope code to INTERNAL", async () => {
    const { fetch } = recorder(() => json(envelope("NOT_A_REAL_CODE", false), 400));
    const client = new AgrorendeApiClient({ baseUrl: BASE, fetch });

    const error = (await catchError(client.me())) as ApiError;

    expect(error.code).toBe("INTERNAL");
    expect(error.status).toBe(400);
    expect(error.retryable).toBe(false);
  });

  it("turns a thrown fetch into a retryable network INTERNAL error", async () => {
    const fetchImpl: FetchLike = async () => {
      throw new TypeError("Network request failed");
    };
    const client = new AgrorendeApiClient({ baseUrl: BASE, fetch: fetchImpl });

    const error = (await catchError(client.syncPush({} as PushRequest))) as ApiError;

    expect(isApiError(error)).toBe(true);
    expect(error.code).toBe("INTERNAL");
    expect(error.details).toEqual({ network: true });
    expect(error.retryable).toBe(true);
    expect(error.status).toBe(0);
    expect(error.cause).toBeInstanceOf(TypeError);
  });

  it("parses Retry-After as seconds or as an HTTP date", () => {
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter("2")).toBe(2000);
    expect(parseRetryAfter("soon")).toBeUndefined();
    const now = Date.parse("2026-10-08T10:00:00Z");
    expect(parseRetryAfter("Thu, 08 Oct 2026 10:00:05 GMT", now)).toBe(5000);
  });

  it("isApiError rejects plain errors", () => {
    expect(isApiError(new Error("x"))).toBe(false);
    expect(isApiError(null)).toBe(false);
  });
});

describe("auth modes", () => {
  it("sends credentials: include in cookie mode and no authorization header", async () => {
    const { fetch, calls } = recorder(() => json({ items: [], nextCursor: null }));
    const client = new AgrorendeApiClient({ baseUrl: BASE, credentials: "include", fetch });

    await client.listUsers();

    expect(calls[0]?.init?.credentials).toBe("include");
    expect(new Headers(calls[0]?.init?.headers).get("authorization")).toBeNull();
  });

  it("omits credentials in bearer mode", async () => {
    const { fetch, calls } = recorder(() => json({ items: [], nextCursor: null }));
    const client = new AgrorendeApiClient({ baseUrl: BASE, tokenProvider: async () => "tok", fetch });

    await client.listUsers();

    expect(calls[0]?.init?.credentials).toBeUndefined();
    expect(new Headers(calls[0]?.init?.headers).get("authorization")).toBe("Bearer tok");
  });

  it("retries once after onUnauthorized refreshes a TOKEN_EXPIRED session", async () => {
    let token = "old";
    const onUnauthorized = vi.fn(async () => {
      token = "new";
      return true;
    });
    const { fetch, calls } = recorder((call) =>
      new Headers(call.init?.headers).get("authorization") === "Bearer old"
        ? json(envelope("TOKEN_EXPIRED", false), 401)
        : json({ token: "socket", expiresAt: "2026-10-08T10:05:00.000Z" }),
    );
    const client = new AgrorendeApiClient({ baseUrl: BASE, tokenProvider: () => token, onUnauthorized, fetch });

    const result = await client.socketToken();

    expect(result.token).toBe("socket");
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(2);
    expect(new Headers(calls[1]?.init?.headers).get("authorization")).toBe("Bearer new");
  });

  it("does not retry when onUnauthorized returns false, and retries at most once", async () => {
    const declined = vi.fn(async () => false);
    const first = recorder(() => json(envelope("TOKEN_EXPIRED", false), 401));
    const clientA = new AgrorendeApiClient({ baseUrl: BASE, onUnauthorized: declined, fetch: first.fetch });
    await expect(clientA.me()).rejects.toMatchObject({ code: "TOKEN_EXPIRED", status: 401 });
    expect(declined).toHaveBeenCalledTimes(1);
    expect(first.calls).toHaveLength(1);

    const accepted = vi.fn(async () => true);
    const second = recorder(() => json(envelope("TOKEN_EXPIRED", false), 401));
    const clientB = new AgrorendeApiClient({ baseUrl: BASE, onUnauthorized: accepted, fetch: second.fetch });
    await expect(clientB.me()).rejects.toMatchObject({ code: "TOKEN_EXPIRED" });
    expect(accepted).toHaveBeenCalledTimes(1);
    expect(second.calls).toHaveLength(2);
  });

  it("does not call onUnauthorized for other 401 codes or public endpoints", async () => {
    const hook = vi.fn(async () => true);
    const { fetch, calls } = recorder(() => json(envelope("UNAUTHENTICATED", false), 401));
    const client = new AgrorendeApiClient({ baseUrl: BASE, onUnauthorized: hook, fetch });

    await expect(client.me()).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect(hook).not.toHaveBeenCalled();
    expect(calls).toHaveLength(1);
  });

  it("shares one onUnauthorized call between concurrent expired requests", async () => {
    let refreshed = false;
    const hook = vi.fn(async () => {
      await Promise.resolve();
      refreshed = true;
      return true;
    });
    const { fetch } = recorder(() => (refreshed ? json({ items: [], nextCursor: null }) : json(envelope("TOKEN_EXPIRED", false), 401)));
    const client = new AgrorendeApiClient({ baseUrl: BASE, onUnauthorized: hook, fetch });

    await Promise.all([client.listAssets(), client.listSites()]);

    expect(hook).toHaveBeenCalledTimes(1);
  });
});

describe("sync", () => {
  it("posts a typed push body and returns the push response", async () => {
    const response: PushResponse = { results: [], serverTime: "2026-10-08T10:00:00.000Z" } as unknown as PushResponse;
    const { fetch, calls } = recorder(() => json(response));
    const client = new AgrorendeApiClient({ baseUrl: BASE, fetch });
    const body = { deviceId: DEVICE_ID, mutations: [] } as unknown as PushRequest;

    const result = await client.syncPush(body);

    expect(calls[0]?.url).toBe(`${BASE}/api/v1/sync/push`);
    expect(calls[0]?.init?.method).toBe("POST");
    expect(new Headers(calls[0]?.init?.headers).get("content-type")).toBe("application/json");
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual(body);
    expect(result).toEqual(response);
  });

  it("serializes pull cursor, deviceId and scopeEpoch as query parameters", async () => {
    const pull: PullResponse = {
      cursor: "next",
      hasMore: false,
      resetRequired: false,
      scopeEpoch: 3,
      changes: {},
      deleted: {},
      resolvedMutations: [],
      serverTime: "2026-10-08T10:00:00.000Z",
    };
    const { fetch, calls } = recorder(() => json(pull));
    const client = new AgrorendeApiClient({ baseUrl: BASE, fetch });

    const first = await client.syncPull({ deviceId: DEVICE_ID, scopeEpoch: 0 });
    await client.syncPull({ cursor: "abc+/=", deviceId: DEVICE_ID, scopeEpoch: 3 });

    expect(first.cursor).toBe("next");
    expect(calls[0]?.init?.method).toBe("GET");
    expect(calls[0]?.url).toBe(`${BASE}/api/v1/sync/pull?deviceId=${DEVICE_ID}&scopeEpoch=0`);
    const second = new URL(calls[1]?.url ?? "");
    expect(second.searchParams.get("cursor")).toBe("abc+/=");
    expect(second.searchParams.get("scopeEpoch")).toBe("3");
    expect(calls[1]?.init?.body).toBeUndefined();
  });
});

describe("requests", () => {
  it("sends If-Match with the DTO version on PATCH", async () => {
    const { fetch, calls } = recorder(() => json({ id: "a" }));
    const client = new AgrorendeApiClient({ baseUrl: BASE, fetch });

    await client.updateAsset("a", { name: "Trator" }, "42");
    await client.updateSettings({ requireWoSignature: true }, "7");

    expect(calls[0]?.init?.method).toBe("PATCH");
    expect(new Headers(calls[0]?.init?.headers).get("if-match")).toBe("42");
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ name: "Trator" });
    expect(calls[1]?.url).toBe(`${BASE}/api/v1/settings`);
    expect(new Headers(calls[1]?.init?.headers).get("if-match")).toBe("7");
  });

  it("escapes path segments", async () => {
    const { fetch, calls } = recorder(() => json({}));
    const client = new AgrorendeApiClient({ baseUrl: BASE, fetch });

    await client.getAsset("a/b?c#d");
    await client.getInvite("x y/../z");
    await client.resolveAttention("MEDIA", "id/1", { note: "ok" });

    expect(calls[0]?.url).toBe(`${BASE}/api/v1/assets/a%2Fb%3Fc%23d`);
    expect(calls[1]?.url).toBe(`${BASE}/api/v1/auth/invites/x%20y%2F..%2Fz`);
    expect(calls[2]?.url).toBe(`${BASE}/api/v1/attention/MEDIA/id%2F1/resolve`);
  });

  it("serializes array filters and skips empty values", async () => {
    const { fetch, calls } = recorder(() => json({ items: [], nextCursor: null }));
    const client = new AgrorendeApiClient({ baseUrl: BASE, fetch });

    await client.listWorkOrders({ status: "OPEN", ids: ["a", "b"], assigneeId: undefined, priority: "HIGH" });

    expect(calls[0]?.url).toBe(`${BASE}/api/v1/work-orders?status=OPEN&ids=a&ids=b&priority=HIGH`);
  });

  it("returns undefined for 204 responses", async () => {
    const { fetch } = recorder(() => new Response(null, { status: 204 }));
    const client = new AgrorendeApiClient({ baseUrl: BASE, fetch });

    await expect(client.logout()).resolves.toBeUndefined();
  });

  it("returns the extended health detail after validating it", async () => {
    const health = { ok: true, app: "agrorende", db: true, redis: true, version: "1.2.3" };
    const { fetch } = recorder(() => json(health));
    const client = new AgrorendeApiClient({ baseUrl: BASE, fetch });

    await expect(client.health()).resolves.toEqual(health);
  });

  it("rejects a captive-portal health response", async () => {
    const { fetch } = recorder(() => json({ hello: "wifi" }));
    const client = new AgrorendeApiClient({ baseUrl: BASE, fetch });

    await expect(client.health()).rejects.toThrow();
  });
});

describe("media helpers", () => {
  it("uploadBlob PUTs to the resolved signed URL without a bearer header", async () => {
    const { fetch, calls } = recorder(() => new Response(null, { status: 204 }));
    const client = new AgrorendeApiClient({ baseUrl: `${BASE}/app/`, tokenProvider: () => "tok", fetch });
    const bytes = new Uint8Array([1, 2, 3]);

    await client.uploadBlob("/api/v1/media/m1/blob?variant=original&t=signed", bytes, "image/jpeg");

    expect(calls[0]?.url).toBe(`${BASE}/api/v1/media/m1/blob?variant=original&t=signed`);
    expect(calls[0]?.init?.method).toBe("PUT");
    const headers = new Headers(calls[0]?.init?.headers);
    expect(headers.get("authorization")).toBeNull();
    expect(headers.get("content-type")).toBe("image/jpeg");
    expect(calls[0]?.init?.body).toBe(bytes);
  });

  it("uploadBlob maps an expired signed URL to UPLOAD_URL_EXPIRED", async () => {
    const { fetch } = recorder(() => json(envelope("UPLOAD_URL_EXPIRED", true), 410));
    const client = new AgrorendeApiClient({ baseUrl: BASE, fetch });

    const error = (await catchError(client.uploadBlob("/api/v1/media/m1/blob?t=x", "data", "text/plain"))) as ApiError;

    expect(error.code).toBe("UPLOAD_URL_EXPIRED");
    expect(error.status).toBe(410);
  });

  it("mediaUrl returns the redirect location without following it", async () => {
    const { fetch, calls } = recorder(() => new Response(null, { status: 302, headers: { location: "/api/v1/media/m%201/blob?variant=thumb&t=sig" } }));
    const client = new AgrorendeApiClient({ baseUrl: BASE, fetch });

    const url = await client.mediaUrl("m 1", "thumb");

    expect(calls[0]?.url).toBe(`${BASE}/api/v1/media/m%201/url?variant=thumb`);
    expect(calls[0]?.init?.redirect).toBe("manual");
    expect(url).toBe(`${BASE}/api/v1/media/m%201/blob?variant=thumb&t=sig`);
  });

  it("mediaUrl surfaces MEDIA_NOT_IN_STORAGE", async () => {
    const { fetch } = recorder(() => json(envelope("MEDIA_NOT_IN_STORAGE", false), 404));
    const client = new AgrorendeApiClient({ baseUrl: BASE, fetch });

    await expect(client.mediaUrl("m1", "poster")).rejects.toMatchObject({ code: "MEDIA_NOT_IN_STORAGE", status: 404 });
  });

  it("mediaUrl falls back to the endpoint URL for opaque browser redirects", async () => {
    const opaque = new Response(null, { status: 200 });
    Object.defineProperty(opaque, "type", { value: "opaqueredirect" });
    Object.defineProperty(opaque, "status", { value: 0 });
    Object.defineProperty(opaque, "ok", { value: false });
    const { fetch } = recorder(() => opaque);
    const client = new AgrorendeApiClient({ baseUrl: BASE, credentials: "include", fetch });

    await expect(client.mediaUrl("m1")).resolves.toBe(`${BASE}/api/v1/media/m1/url?variant=original`);
  });
});
