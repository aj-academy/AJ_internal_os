import { NextRequest, NextResponse } from "next/server";
import { fetchMyProfile } from "@/lib/auth/fetchMyProfile";
import { validateLoginProfile, type LoginRoleOption } from "@/lib/auth/validateLoginProfile";
import { getRoleRedirectPath } from "@/lib/auth/roleRedirect";
import { applySupabaseCookieOptions } from "@/lib/supabase/cookies";
import { createClientFromRequest } from "@/lib/supabase/route-handler";
import { enforceRateLimit } from "@/lib/security";
import { logSecurityEvent } from "@/lib/security/auditLog";
import { isValidEmail } from "@/lib/security/validate";

const LOGIN_ROLES = new Set<LoginRoleOption>(["admin", "student", "freelancer", "mentor"]);

function copyAuthCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((cookie) => {
    to.cookies.set({
      name: cookie.name,
      value: cookie.value,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
  });
}

export async function POST(request: NextRequest) {
  const limited = enforceRateLimit(request, "auth:sign-in", {
    limit: 15,
    windowMs: 15 * 60_000,
  });
  if (limited) return limited;

  const wantsJson =
    request.headers.get("accept")?.includes("application/json") ||
    request.headers.get("x-login-mode") === "json";

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const record = body as Record<string, unknown>;
  const email = typeof record.email === "string" ? record.email.trim().toLowerCase() : "";
  const password = typeof record.password === "string" ? record.password : "";
  const selectedRole =
    typeof record.selectedRole === "string"
      ? (record.selectedRole.trim().toLowerCase() as LoginRoleOption)
      : ("" as LoginRoleOption);

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }

  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "Invalid email address." }, { status: 400 });
  }

  if (!LOGIN_ROLES.has(selectedRole)) {
    return NextResponse.json({ error: "Invalid role selected." }, { status: 400 });
  }

  let authResponse = NextResponse.json({ ok: false });

  let supabase;
  try {
    supabase = createClientFromRequest(request, authResponse);
  } catch (configError) {
    const message =
      configError instanceof Error ? configError.message : "Supabase is not configured.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  let signInData;
  let signInError;

  try {
    const result = await supabase.auth.signInWithPassword({ email, password });
    signInData = result.data;
    signInError = result.error;
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Network error";
    return NextResponse.json(
      {
        error:
          message.toLowerCase().includes("fetch failed")
            ? "App cannot reach Supabase. Check internet, NEXT_PUBLIC_SUPABASE_URL in .env.local, and restart npm run dev."
            : `Sign-in failed (${message}).`,
      },
      { status: 503 },
    );
  }

  if (signInError || !signInData.user) {
    const authMessage = signInError?.message ?? "";
    logSecurityEvent("sign_in_failed", { email });
    const lower = authMessage.toLowerCase();
    const friendly = lower.includes("fetch failed")
      ? "App cannot reach Supabase. Check .env.local URL and restart npm run dev."
      : lower.includes("invalid login credentials") ||
          lower.includes("invalid email or password")
        ? "Incorrect email or password. In Supabase → Authentication → Users, open this user and set a new password (or use Forgot password)."
        : authMessage || "Invalid credentials.";
    return NextResponse.json({ error: friendly }, { status: 401 });
  }

  const { profile, loadError } = await fetchMyProfile(supabase, signInData.user);

  if (loadError && !profile) {
    await supabase.auth.signOut();
    return NextResponse.json(
      { error: `Could not load your profile (${loadError}). Run profiles_rls_fix.sql in Supabase.` },
      { status: 403 },
    );
  }

  const validation = validateLoginProfile(profile, selectedRole);
  if (!validation.ok) {
    await supabase.auth.signOut();
    logSecurityEvent("sign_in_role_denied", { email, role: selectedRole });
    return NextResponse.json({ error: validation.error }, { status: 403 });
  }

  logSecurityEvent("sign_in_ok", { email, role: validation.role });

  const redirectTo = getRoleRedirectPath(validation.role);
  const redirectUrl = new URL(redirectTo, request.url);

  if (wantsJson) {
    const response = NextResponse.json({ ok: true, redirectTo });
    copyAuthCookies(authResponse, response);
    return response;
  }

  const response = NextResponse.redirect(redirectUrl, { status: 303 });
  authResponse.cookies.getAll().forEach(({ name, value }) => {
    response.cookies.set(name, value, applySupabaseCookieOptions());
  });
  return response;
}
