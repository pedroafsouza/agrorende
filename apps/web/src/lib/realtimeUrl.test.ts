// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { clientRealtimeUrl, DEFAULT_REALTIME_URL, REALTIME_URL_META, serverRealtimeUrl } from "./realtimeUrl";

afterEach(() => {
  document.head.innerHTML = "";
});

describe("realtime URL at run time (change request T18-003)", () => {
  it("reads the server environment at request time and rejects values that are not http(s) URLs", () => {
    expect(serverRealtimeUrl({ NEXT_PUBLIC_REALTIME_URL: "https://ws.staging.agrorende.com.br" })).toBe("https://ws.staging.agrorende.com.br");
    expect(serverRealtimeUrl({ NEXT_PUBLIC_REALTIME_URL: "javascript:alert(1)" })).toBe(DEFAULT_REALTIME_URL);
    expect(serverRealtimeUrl({})).toBe(DEFAULT_REALTIME_URL);
  });

  it("prefers the server-rendered meta tag in the browser", () => {
    const meta = document.createElement("meta");
    meta.name = REALTIME_URL_META;
    meta.content = "https://ws.agrorende.com.br";
    document.head.append(meta);
    expect(clientRealtimeUrl()).toBe("https://ws.agrorende.com.br");
  });

  it("falls back to the build-time value or the local default without a meta tag", () => {
    expect(clientRealtimeUrl()).toBe(process.env.NEXT_PUBLIC_REALTIME_URL ?? DEFAULT_REALTIME_URL);
  });
});
