import { NextRequest, NextResponse } from "next/server";
import {
  getSupabaseProjectRef,
  writeAuthSessionCookies,
} from "@/lib/supabase/write-auth-cookies";
import { mirrorSupabaseCookiesFromHeader } from "@/lib/supabase/mirror-browser-cookies";
import {
  PROFILE_SESSION_COOKIE,
  type ProfileSessionPayload,
} from "@/lib/auth/profile-session-cookie";
import { applySupabaseCookieOptions } from "@/lib/supabase/cookies";

/** Saves browser login session + profile hint into cookies for server layouts. */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const record = body as Record<string, unknown>;
  const browserCookies =
    typeof record.browserCookies === "string" ? record.browserCookies : "";
  const session =
    record.session && typeof record.session === "object"
      ? (record.session as Record<string, unknown>)
      : null;
  const profile =
    record.profile && typeof record.profile === "object"
      ? (record.profile as ProfileSessionPayload)
      : null;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const projectRef = getSupabaseProjectRef(supabaseUrl);

  if (!projectRef) {
    return NextResponse.json({ error: "Invalid NEXT_PUBLIC_SUPABASE_URL." }, { status: 500 });
  }

  const hasBrowserAuthCookie = /sb-[a-z0-9]+-auth-token/i.test(browserCookies);

  if (!session?.access_token && !session?.refresh_token && !hasBrowserAuthCookie) {
    return NextResponse.json({ error: "Missing session data." }, { status: 400 });
  }

  const response = NextResponse.json({ ok: true });
  const cookieOptions = applySupabaseCookieOptions({ maxAge: 400 * 24 * 60 * 60 });

  if (session?.access_token && session?.refresh_token) {
    writeAuthSessionCookies(response, projectRef, session);
  } else if (hasBrowserAuthCookie) {
    mirrorSupabaseCookiesFromHeader(response, browserCookies);
  }

  const sessionUser =
    session?.user && typeof session.user === "object"
      ? (session.user as { id?: string; email?: string })
      : null;
  const authUserId = typeof sessionUser?.id === "string" ? sessionUser.id : "";
  const authEmail =
    typeof sessionUser?.email === "string" ? sessionUser.email.trim().toLowerCase() : "";

  if (profile?.role && profile?.email && authUserId) {
    const payload: ProfileSessionPayload = {
      id: authUserId,
      role: String(profile.role).trim().toLowerCase() as ProfileSessionPayload["role"],
      email: String(profile.email).trim().toLowerCase(),
      full_name: profile.full_name ?? null,
    };
    if (!payload.email && authEmail) {
      payload.email = authEmail;
    }
    response.cookies.set(PROFILE_SESSION_COOKIE, JSON.stringify(payload), cookieOptions);
  }

  return response;
}
