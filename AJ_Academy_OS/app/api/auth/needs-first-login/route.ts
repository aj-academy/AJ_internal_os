import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, enforceRateLimit } from "@/lib/security";
import { isValidEmail } from "@/lib/security/validate";

/** True only when the auth user has never completed a sign-in (first-time password bootstrap). */
export async function POST(request: Request) {
  const limited = enforceRateLimit(request, "auth:needs-first-login", {
    limit: 20,
    windowMs: 15 * 60_000,
  });
  if (limited) return limited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const email =
    typeof (body as Record<string, unknown>).email === "string"
      ? (body as Record<string, string>).email.trim().toLowerCase()
      : "";

  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ error: "Valid email is required." }, { status: 400 });
  }

  const emailLimited = checkRateLimit(`auth:needs-first-login:email:${email}`, {
    limit: 10,
    windowMs: 15 * 60_000,
  });
  if (!emailLimited.ok) {
    return NextResponse.json({ needsFirstLogin: false });
  }

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();

  if (!profile?.id) {
    return NextResponse.json({ needsFirstLogin: false });
  }

  const { data: authUser, error } = await admin.auth.admin.getUserById(profile.id);
  if (error || !authUser.user) {
    return NextResponse.json({ needsFirstLogin: false });
  }

  return NextResponse.json({ needsFirstLogin: !authUser.user.last_sign_in_at });
}
