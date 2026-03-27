import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "admin_session";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export async function POST(request: NextRequest) {
  let body: { username?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { username, password } = body;

  if (
    !username ||
    !password ||
    username !== process.env.ADMIN_USER ||
    password !== process.env.ADMIN_PASS
  ) {
    // Uniform response — don't reveal which field is wrong
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const response = NextResponse.json({ success: true });

  // AUTH_SECRET is the session token value.
  // It never leaves the server as a plain secret — it's stored in an
  // HTTP-only cookie, invisible to browser JavaScript.
  response.cookies.set(COOKIE_NAME, process.env.AUTH_SECRET!, {
    httpOnly:  true,
    secure:    process.env.NODE_ENV === "production",
    sameSite:  "lax",
    maxAge:    COOKIE_MAX_AGE,
    path:      "/",
  });

  return response;
}
