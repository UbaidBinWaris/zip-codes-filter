import { NextRequest, NextResponse } from "next/server";
import { SignJWT } from "jose";

const COOKIE_NAME    = "admin_token";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days in seconds

function signingKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET env var is not set.");
  return new TextEncoder().encode(secret);
}

/**
 * POST /api/admin/login
 *
 * Verifies credentials against ADMIN_USER / ADMIN_PASS env vars,
 * then issues a signed JWT stored in an HTTP-only cookie.
 *
 * Because every token is independently signed (not a shared secret value),
 * multiple devices can hold valid tokens simultaneously — logging in on
 * one device never invalidates another device's session.
 */
export async function POST(request: NextRequest) {
  let body: { username?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { username, password } = body;

  // Uniform 401 — don't reveal which field is wrong
  if (
    !username ||
    !password ||
    username !== process.env.ADMIN_USER ||
    password !== process.env.ADMIN_PASS
  ) {
    return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
  }

  // Sign a fresh JWT for this device — the signing key (AUTH_SECRET) stays
  // server-side and is never exposed in the cookie value.
  const token = await new SignJWT({ user: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(signingKey());

  const response = NextResponse.json({ success: true });

  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge:   COOKIE_MAX_AGE,
    path:     "/",
  });

  return response;
}
