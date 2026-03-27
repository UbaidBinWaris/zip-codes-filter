import { NextRequest, NextResponse } from "next/server";
import { SignJWT } from "jose";

// ---------------------------------------------------------------------------
// Hardcoded credentials — no environment variables required.
// Change these before any public deployment.
// ---------------------------------------------------------------------------
const ADMIN_USER     = "password";   // matches ADMIN_USER in .env
const ADMIN_PASS     = "user123";    // matches ADMIN_PASS in .env
const SECRET         = new TextEncoder().encode("super_secret_key_123456789");
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

/**
 * POST /api/admin/login
 *
 * Validates credentials and issues a signed JWT stored in an HTTP-only cookie.
 * Uses jose (Web Crypto) — works in both Node.js runtime and Edge Runtime.
 * Each call produces a fresh, independent token so multiple devices stay
 * logged in simultaneously.
 */
export async function POST(request: NextRequest) {
  let body: { username?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const username = body.username?.trim() ?? "";
  const password = body.password?.trim() ?? "";

  console.log("Login attempt — user:", username); // remove after confirming it works

  if (username !== ADMIN_USER || password !== ADMIN_PASS) {
    return NextResponse.json({ error: "Invalid username or password." }, { status: 401 });
  }

  const token = await new SignJWT({ user: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(SECRET);

  const response = NextResponse.json({ success: true });

  response.cookies.set("admin_token", token, {
    httpOnly: true,
    secure:   false,   // false = works on HTTP (localhost + plain production)
    sameSite: "lax",
    maxAge:   COOKIE_MAX_AGE,
    path:     "/",
  });

  return response;
}
