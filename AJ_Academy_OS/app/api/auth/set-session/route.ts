import { NextRequest, NextResponse } from "next/server";
import {
  getSupabaseProjectRef,
  writeAuthSessionCookies,
} from "@/lib/supabase/write-auth-cookies";
import { createClientWithAccessToken } from "@/lib/supabase/access-token-client";
import {
  PROFILE_SESSION_COOKIE,
  type ProfileSessionPayload,
} from "@/lib/auth/profile-session-cookie";
import { applySupabaseCookieOptions } from "@/lib/supabase/cookies";
import { loadAuthorizedProfile, enforceRateLimit } from "@/lib/security";
import { logSecurityEvent } from "@/lib/security/auditLog";

/** Saves verified login session + server-verified profile hint into httpOnly cookies. */
export async function POST(request: NextRequest) {
  const limited = enforceRateLimit(request, "auth:set-session", {
    limit: 30,
    windowMs: 60_000,
  });
  if (limited) return limited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const record = body as Record<string, unknown>;
  const session =
    record.session && typeof record.session === "object"
      ? (record.session as Record<string, unknown>)
      : null;

  const accessToken =
    typeof session?.access_token === "string" ? session.access_token.trim() : "";
  const refreshToken =
    typeof session?.refresh_token === "string" ? session.refresh_token.trim() : "";

  if (!accessToken || !refreshToken) {
    logSecurityEvent("set_session_rejected", { reason: "missing_tokens" });
    return NextResponse.json({ error: "Valid session tokens are required." }, { status: 400 });
  }

  let verifiedUserId = "";
  let verifiedEmail = "";
  try {
    const tokenClient = createClientWithAccessToken(accessToken);
    const { data: userData, error: userError } = await tokenClient.auth.getUser(accessToken);
    if (userError || !userData.user) {
      logSecurityEvent("set_session_rejected", { reason: "invalid_token" });
      return NextResponse.json({ error: "Invalid session token." }, { status: 401 });
    }
    verifiedUserId = userData.user.id;
    verifiedEmail = (userData.user.email ?? "").trim().toLowerCase();
  } catch {
    logSecurityEvent("set_session_rejected", { reason: "token_verify_failed" });
    return NextResponse.json({ error: "Could not verify session." }, { status: 401 });
  }

  const sessionUser =
    session?.user && typeof session.user === "object"
      ? (session.user as { id?: string; email?: string })
      : null;
  const bodyUserId = typeof sessionUser?.id === "string" ? sessionUser.id : "";
  if (bodyUserId && bodyUserId !== verifiedUserId) {
    logSecurityEvent("set_session_rejected", { reason: "user_id_mismatch" });
    return NextResponse.json({ error: "Session user mismatch." }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const projectRef = getSupabaseProjectRef(supabaseUrl);
  if (!projectRef) {
    return NextResponse.json({ error: "Invalid NEXT_PUBLIC_SUPABASE_URL." }, { status: 500 });
  }

  const response = NextResponse.json({ ok: true });
  const cookieOptions = applySupabaseCookieOptions({ maxAge: 400 * 24 * 60 * 60 });

  writeAuthSessionCookies(response, projectRef, session!);

  const profile = await loadAuthorizedProfile({ id: verifiedUserId, email: verifiedEmail });
  if (profile?.role && profile.email) {
    const payload: ProfileSessionPayload = {
      id: verifiedUserId,
      role: profile.role,
      email: profile.email,
      full_name: profile.full_name ?? null,
    };
    response.cookies.set(PROFILE_SESSION_COOKIE, JSON.stringify(payload), {
      ...cookieOptions,
      httpOnly: true,
    });
    logSecurityEvent("set_session_ok", { userId: verifiedUserId, role: profile.role });
  }

  return response;
}
