import { DEFAULT_LOCALE, resolveLocale } from "@agrorende/i18n/locales";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PREFIXES = ["/login", "/change-password", "/signup", "/i/", "/r/", "/api/v1/health", "/api/v1/auth", "/api/v1/signup", "/platform/login", "/platform/auth"] as const;
const ADMIN_PREFIXES = ["/ops", "/attention", "/reports", "/work-orders", "/rentals", "/assets", "/sites", "/customers", "/team", "/templates", "/seasons", "/costs", "/imports", "/settings", "/account", "/office-role-required", "/notifications", "/analytics", "/parts", "/stock", "/maintenance", "/fuel", "/billing"] as const;
const BLOB_ROUTE = /^\/api\/v1\/media\/[^/]+\/blob(?:\/.*)?$/;

function startsWithAny(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function localeResponse(request: NextRequest): NextResponse {
  const cookieLocale = request.cookies.get("NEXT_LOCALE")?.value;
  const locale = resolveLocale([cookieLocale ?? "", request.headers.get("accept-language") ?? "", DEFAULT_LOCALE]);
  const response = NextResponse.next();
  response.cookies.set("NEXT_LOCALE", locale, { sameSite: "lax", path: "/" });
  response.headers.set("x-agrorende-locale", locale);
  return response;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (BLOB_ROUTE.test(pathname)) {
    return NextResponse.next();
  }

  const isPublic = startsWithAny(pathname, PUBLIC_PREFIXES) || pathname.startsWith("/_next") || pathname.includes(".");
  const hasAccess = request.cookies.has("ar_access");
  const hasPlatformAccess = request.cookies.has("ar_platform");

  if (pathname.startsWith("/platform") && !pathname.startsWith("/platform/login") && !hasPlatformAccess) {
    return NextResponse.redirect(new URL("/platform/login", request.url));
  }

  if (!isPublic && startsWithAny(pathname, ADMIN_PREFIXES) && !hasAccess) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return localeResponse(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/v1/media/[^/]+/blob).*)"],
};
