/** The rate-limit key for the public provider link: the first forwarded address, never logged. */
export function providerClientKey(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded !== undefined && forwarded.length > 0) return forwarded;
  const real = headers.get("x-real-ip")?.trim();
  return real !== undefined && real.length > 0 ? real : "unknown";
}
