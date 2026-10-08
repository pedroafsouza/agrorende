const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function base64UrlDecode(input: string): string {
  const clean = input.replace(/-/g, "+").replace(/_/g, "/");
  let bits = 0;
  let value = 0;
  let out = "";
  for (const char of clean) {
    if (char === "=") break;
    const idx = B64.indexOf(char);
    if (idx < 0) continue;
    value = (value << 6) | idx;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out += String.fromCharCode((value >> bits) & 0xff);
    }
  }
  try {
    return decodeURIComponent(
      out
        .split("")
        .map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, "0")}`)
        .join(""),
    );
  } catch (_error) {
    return out;
  }
}

/** Reads the `exp` claim (ms) of a JWT without verifying it; the server stays the authority. */
export function jwtExpiryMs(token: string): number | undefined {
  const payload = token.split(".")[1];
  if (payload === undefined) return undefined;
  try {
    const claims = JSON.parse(base64UrlDecode(payload)) as { exp?: unknown };
    return typeof claims.exp === "number" ? claims.exp * 1000 : undefined;
  } catch (_error) {
    return undefined;
  }
}

/** True when the token expires within `skewMs` (default 60 s). */
export function isExpiring(token: string | undefined, nowMs: number, skewMs = 60_000): boolean {
  if (token === undefined) return true;
  const exp = jwtExpiryMs(token);
  return exp === undefined ? false : exp - skewMs <= nowMs;
}
