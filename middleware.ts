import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

/**
 * Returns the signing key as a Uint8Array.
 * `jose` uses the Web Crypto API — no Node.js built-ins — so this runs
 * correctly in the Next.js Edge Runtime.
 */
function signingKey(): Uint8Array {
  return new TextEncoder().encode(process.env.AUTH_SECRET ?? "");
}

function redirectToLogin(request: NextRequest, from: string): NextResponse {
  const url = new URL("/admin/login", request.url);
  url.searchParams.set("from", from);
  return NextResponse.redirect(url);
}

/**
 * Protects all /admin routes except /admin/login.
 *
 * Reads the `admin_token` HTTP-only cookie and verifies its JWT signature
 * against AUTH_SECRET. Each device holds its own independently-signed token,
 * so logging in on one device never invalidates another device's session.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Always let the login page through
  if (pathname === "/admin/login") {
    return NextResponse.next();
  }

  const token = request.cookies.get("admin_token")?.value;

  if (!token) {
    return redirectToLogin(request, pathname);
  }

  try {
    // Throws if the signature is invalid or the token has expired
    await jwtVerify(token, signingKey());
    return NextResponse.next();
  } catch {
    // Expired or tampered token — send to login
    return redirectToLogin(request, pathname);
  }
}

export const config = {
  matcher: ["/admin/:path*"],
};
