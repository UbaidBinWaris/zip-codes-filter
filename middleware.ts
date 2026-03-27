import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

// Must match the secret used in the login route exactly.
const SECRET = new TextEncoder().encode("super_secret_key_123456789");

function redirectToLogin(request: NextRequest, from: string): NextResponse {
  const url = new URL("/admin/login", request.url);
  url.searchParams.set("from", from);
  return NextResponse.redirect(url);
}

/**
 * Protects all /admin routes except /admin/login.
 * Reads the admin_token cookie and verifies its JWT signature.
 * Uses jose (Web Crypto API) — compatible with the Next.js Edge Runtime.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/admin/login") {
    return NextResponse.next();
  }

  const token = request.cookies.get("admin_token")?.value;

  if (!token) {
    return redirectToLogin(request, pathname);
  }

  try {
    await jwtVerify(token, SECRET);
    return NextResponse.next();
  } catch {
    return redirectToLogin(request, pathname);
  }
}

export const config = {
  matcher: ["/admin/:path*"],
};
