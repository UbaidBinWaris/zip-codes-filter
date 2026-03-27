import { NextRequest, NextResponse } from "next/server";
import { SignJWT } from "jose";

// ---------------------------------------------------------------------------
// Credentials & secret — hardcoded for simplified deployment.
// Replace with hashed passwords + env vars before exposing publicly.
// ---------------------------------------------------------------------------
const ADMIN_USER     = "admin";
const ADMIN_PASS     = "123456";
const SECRET         = new TextEncoder().encode("super_secret_key_123456789");
const COOKIE_NAME    = "admin_token";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

/**
 * POST /api/admin/login
 *
 * Validates credentials, signs a JWT, and stores it in an HTTP-only cookie.
 * Each call produces an independent token so multiple devices stay logged in
 * simultaneously without overwriting each other's sessions.
 */
export async function POST(request: NextRequest) {
  let body: { username?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { username, password } = body;

  if (!username || !password || username !== ADMIN_USER || password !== ADMIN_PASS) {
    return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
  }

  const token = await new SignJWT({ user: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(SECRET);

  const response = NextResponse.json({ success: true });

  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure:   false,   // false = works on both localhost and plain HTTP production
    sameSite: "lax",
    maxAge:   COOKIE_MAX_AGE,
    path:     "/",
  });

  return response;
}
