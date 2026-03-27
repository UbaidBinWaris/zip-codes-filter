import { NextRequest, NextResponse } from "next/server";

/**
 * Protects all /admin routes except /admin/login.
 * Validates the HTTP-only session cookie set by POST /api/admin/login.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Always allow the login page itself
  if (pathname === "/admin/login") {
    return NextResponse.next();
  }

  const session = request.cookies.get("admin_session");
  const isAuthenticated =
    session?.value &&
    process.env.AUTH_SECRET &&
    session.value === process.env.AUTH_SECRET;

  if (!isAuthenticated) {
    const loginUrl = new URL("/admin/login", request.url);
    // Preserve the original destination so the login page can redirect back
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Apply only to /admin and its sub-paths
  matcher: ["/admin/:path*"],
};
