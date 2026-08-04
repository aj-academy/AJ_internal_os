import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAppOrigin, passwordRecoveryRedirectTo } from "@/lib/auth/appUrl";
import { checkRateLimit, clientIp, enforceRateLimit, rateLimitResponse } from "@/lib/security";
import { logSecurityEvent } from "@/lib/security/auditLog";
import { isValidEmail } from "@/lib/security/validate";

export const runtime = "nodejs";

const NEUTRAL_MESSAGE =
  "If an AJ OS account exists for this email address, a password-reset link has been sent.";

function emailHash(email: string): string {
  return createHash("sha256").update(email).digest("hex").slice(0, 16);
}

/**
 * POST /api/auth/forgot-password
 * Triggers Supabase recovery email. Always returns a neutral success body
 * (except invalid format / rate limit) to prevent account enumeration.
 */
export async function POST(request: NextRequest) {
  const limited = enforceRateLimit(request, "auth:forgot-password", {
    limit: 8,
    windowMs: 15 * 60_000,
  });
  if (limited) return limited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const emailRaw =
    typeof (body as { email?: unknown }).email === "string"
      ? (body as { email: string }).email
      : "";
  const email = emailRaw.trim().toLowerCase();

  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const hash = emailHash(email);
  const emailLimited = checkRateLimit(`auth:forgot-password:email:${hash}`, {
    limit: 5,
    windowMs: 15 * 60_000,
  });
  if (!emailLimited.ok) {
    return rateLimitResponse(emailLimited.retryAfterMs);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) {
    logSecurityEvent("password_reset_request_failed", { reason: "supabase_not_configured" });
    // Still neutral to the user — do not leak infra status beyond a soft message
    return NextResponse.json({ ok: true, message: NEUTRAL_MESSAGE });
  }

  const origin = getAppOrigin(request.nextUrl.origin);
  const redirectTo = passwordRecoveryRedirectTo(origin);

  try {
    const supabase = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });

    // Log only safe metadata — never the recovery URL or whether the user exists.
    logSecurityEvent("password_reset_request", {
      emailHash: hash,
      ip: clientIp(request),
      ok: !error,
      stage: error ? "supabase_error" : "accepted",
    });
  } catch (cause) {
    logSecurityEvent("password_reset_request_failed", {
      emailHash: hash,
      ip: clientIp(request),
      reason: cause instanceof Error ? cause.message.slice(0, 120) : "unknown",
    });
  }

  return NextResponse.json({ ok: true, message: NEUTRAL_MESSAGE });
}
